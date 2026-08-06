# Plumo CS — chatbot integration

For a third-party chatbot that files and follows support conversations.

```
Base URL   https://csapi.plumo.work/api/v1
Auth       X-Api-Key: plumo_sk_…          (on every request)
```

## Before you start

**Server-to-server only.** The credential is an API key, and a key in browser
JavaScript is readable by anyone who views source — it can file and read tickets
for the whole desk. There is deliberately no CORS allowance, so a browser widget
must call *your* backend, which calls this.

**One key is one chatbot.** Everything it creates is attributed back to it.

**You get ticket UUIDs, never ticket numbers.** Numbers are display-only inside
the console and are about to become per-workspace; the UUID is stable forever.

## The two ideas worth understanding

**`sessionRef` is yours.** You pick it — your own conversation id. We map it to
exactly one ticket. Send the same one twice and you get the same ticket back, not
a duplicate. Everything else is addressed by it.

**`botEnabled` says whether your bot may speak.** This is the hard gate. Check it
before generating a reply — if it is `false`, a human has taken the conversation
and `POST …/messages` with `author: "bot"` returns **403**. Visitor messages are
never blocked.

It flips to `false` automatically when an agent replies in the console, or when
you call `/handoff`. An agent can hand the conversation back, at which point it
returns to `true` — so re-check it on every poll, not just once.

**`handling` tells you who is answering.** Every response carries it too:

| `handling` | meaning | what your bot should do |
| --- | --- | --- |
| `ai` | the bot owns it | keep answering |
| `escalated` | handed off, no agent yet | stop answering, poll, tell the user |
| `assigned` | an agent owns it | stop answering, poll |
| `closed` | finished | nothing, until the visitor writes again |

Rule of thumb: **`botEnabled` decides whether you may post. `handling` decides
what you tell the user.**

`status` is a different question — where the ticket is in its lifecycle. Branch on
`handling`, not `status`.

---

# The endpoints

### Open a conversation

```http
POST /chat/conversations
{
  "sessionRef":   "conv_8f21",           // required — your conversation id
  "visitorRef":   "user_5512",           // optional — your id for the person
  "visitorName":  "Leah Brenner",        // optional
  "visitorEmail": "leah@acme.com",       // optional — anonymous is fine
  "subject":      "Duplicate charge",    // optional — derived from message if absent
  "message":      "I was charged twice", // optional — becomes the first message
  "tags":         ["billing"]            // optional
}
```
```json
{ "ticketId": "9ab7…", "sessionRef": "conv_8f21", "status": "new",
  "handling": "ai", "botEnabled": true, "handedOff": false, "created": true }
```

Idempotent. A retry returns the same ticket with `"created": false`.

### Append a turn

```http
POST /chat/conversations/{sessionRef}/messages
{ "body": "I can look that up.", "author": "bot", "externalRef": "turn_17" }
```
```json
{ "messageId": "53600…", "ticketId": "9ab7…", "duplicate": false,
  "handling": "ai", "botEnabled": true }
```

`author` is `"bot"` or `"visitor"`. **Always send `externalRef`** — your own
message id. Without it a retry posts the message twice; with it you get the
original back and `"duplicate": true`.

`handling` and `botEnabled` describe the conversation **after** this write, so
you do not need a follow-up `GET` to find out whether your bot may answer the
next turn. Note they are still a *read*: by the time you act on them an agent
may have taken over. The authoritative check is the write itself — a `403` on
your next `author: "bot"` message. Treat these fields as the fast path and the
`403` as the truth.

**`403` on an `author: "bot"` message means a human has taken over.** Do not
retry it. Stop generating replies for that conversation, keep relaying the
visitor's messages, and keep polling for the agent's.

### Hand off to a human

```http
POST /chat/conversations/{sessionRef}/handoff
{ "reason": "billing dispute", "priority": "high" }     // both optional
```
```json
{ "ticketId": "9ab7…", "status": "open", "handling": "escalated",
  "handedOffAt": "2026-08-02T00:03:28.789Z", "alreadyHandedOff": false }
```

`priority`: `low` · `normal` · `high` · `urgent`. `reason` becomes an internal
note so the agent has context without reading the thread.

Calling it twice is harmless — the second returns `alreadyHandedOff: true` with
the *original* timestamp, so a retry cannot restart the response clock.

### Resolve it yourself

```http
POST /chat/conversations/{sessionRef}/resolve
{ "outcome": "answered" }        // or "out_of_scope"
```

`403` once a human has taken over — after handoff only the agent closes it.

### Poll for agent replies

```http
GET /chat/updates?since=2026-08-01T18:00:00.000Z&limit=50
```
```json
{ "cursor": "2026-08-01T18:38:51.992Z", "hasMore": false,
  "updates": [ { "messageId": "…", "sessionRef": "conv_8f21", "ticketId": "…",
                 "status": "open", "handling": "assigned", "botEnabled": false,
                 "body": "I refunded it.", "at": "…" } ] }
```

Pass the returned `cursor` as the next `since`. Poll every 5–15s; if `hasMore` is
true, poll again immediately instead of waiting.

Each row carries the conversation's `handling` and `botEnabled` as of the read,
so you can store the state alongside the message without a second request per
update.

Only **human agent** replies appear here — never your own bot messages, and never
agents' internal notes to each other.

**Expect the same message more than once, and make your writes idempotent on
`messageId`.** The cursor is deliberately held a little behind the present. A
message's timestamp is assigned when its transaction starts but the row only
appears when that transaction commits, so a reply can surface *after* a
later-stamped one — and a cursor that ran straight to the newest row would step
over it permanently. Holding the cursor back re-delivers the most recent seconds
instead. Duplicates you can drop; a skipped reply is gone for good.

Two rules follow, and both matter:

- **Only advance your stored cursor once the batch is safely written.** If a
  write fails, keep the old cursor and retry — do not advance past a row you
  did not store, or you reproduce exactly the loss the safety margin exists to
  prevent.
- **Do not mark a message as "already seen" until its write commits**, or a
  failed write will suppress its own retry.

### Read one conversation

```http
GET /chat/conversations/{sessionRef}
```
```json
{ "ticketId": "…", "status": "open", "handling": "ai",
  "messages": [ { "id": "…", "author": "visitor|bot|agent", "body": "…",
                  "at": "…", "externalRef": "…" } ] }
```

---

# Use cases

## 1. The bot answers everything

```
POST /chat/conversations                      → handling: ai
POST /chat/conversations/{ref}/messages       author: bot
POST /chat/conversations/{ref}/messages       author: visitor
POST /chat/conversations/{ref}/messages       author: bot
POST /chat/conversations/{ref}/resolve        → handling: closed
```

Nobody is paged. The conversation is visible to agents under **handled by AI**
but stays out of their queue — which is the point.

## 2. An agent takes over without a handoff

Common: someone reads the inbox and just answers. There is no `/handoff` call, so
watch `botEnabled` rather than waiting for `handedOff`.

```
GET /chat/conversations/{ref}   → botEnabled: false, handling: "escalated"
```

Stop answering, tell the user a person is on it, keep polling. If the agent later
hands it back you will see `botEnabled: true` again and may resume.

## 3. The bot gives up

```
POST /chat/conversations/{ref}/handoff        → handling: escalated
```

Then:
1. **Stop answering.** Visitor turns still go through; bot answers now compete
   with a human.
2. **Tell the user** — "I've passed this to our team, they'll reply here."
3. **Keep polling** `/chat/updates`. That is the only way you see the reply.
4. **Don't call `/resolve`** — it will 403.

## 4. An anonymous visitor

Send `visitorRef` and no email. The same `visitorRef` across conversations is
recognised as the same person, so their history stays joined up.

If they later give an email, include `visitorEmail` when opening the *next*
conversation and they are matched to the real customer record.

## 5. The visitor comes back after it was finished

Just append the message as normal. A visitor turn on a `closed` conversation
**reopens it automatically**:

- the bot had resolved it → returns to the bot (`handling: ai`)
- an agent had closed it → returns to the agent (`escalated` / `assigned`)

You do not need to detect this or open a new conversation. Check `handling` in
the next `GET` if you want to know who picked it up.

## 6. Retries and failures

| Situation | What to do |
| --- | --- |
| Timeout on open | Retry the same `sessionRef`. You get the same ticket. |
| Timeout on a message | Retry with the same `externalRef`. No duplicate. |
| Timeout on handoff | Retry. `alreadyHandedOff: true`, same timestamp. |
| `429` | Back off and retry. |
| `5xx` | Retry with backoff; all four calls above are safe to repeat. |

The one call that is **not** safe to blind-retry is a message **without**
`externalRef` — it will post twice. Always send one.

---

# Errors

| Status | Meaning |
| --- | --- |
| `400` | Validation failed. Unknown fields are rejected — do not send extras. |
| `401` | Key missing, revoked or expired. An expired key says so explicitly. |
| `403` | Missing scope, or **a human owns the conversation** (`botEnabled: false`). Not retryable. |
| `404` | No such conversation **for this key**. Another chatbot's `sessionRef` is indistinguishable from one that never existed. |
| `429` | Rate limited. |

```json
{ "error": { "code": "NOT_FOUND", "message": "No such conversation" },
  "requestId": "req-42" }
```

Quote `requestId` when reporting a problem — it identifies the request in our logs.

# Limits

- Message body: 16,000 characters
- `sessionRef`, `visitorRef`, `externalRef`: 200 characters

# Keeping the widget live

Agent replies reach you by **polling** — there is no socket for partners.

```js
let cursor = new Date().toISOString();

async function poll() {
  const r = await fetch(`${BASE}/chat/updates?since=${encodeURIComponent(cursor)}`,
                        { headers: { 'X-Api-Key': KEY } }).then((r) => r.json());
  for (const u of r.updates) {
    try { await store(u); }               // idempotent, keyed on u.messageId
    catch { return backoff(); }           // keep the OLD cursor and retry
  }
  cursor = r.cursor;                      // only now — the batch is safe
  if (r.hasMore) return poll();           // page was full — drain now
}
setInterval(poll, 5000);                  // only while a chat is open
```

- Deduplicate on `messageId` — the same reply can be delivered more than once,
  by design (see above).
- **Advance the cursor after the batch is stored, never before.** Advancing
  first means any failed write is skipped forever, with nothing but a log line
  to show for it.
- On `5xx`/network error: back off 5s → 10s → 20s (cap 60s) and **do not**
  advance the cursor. On `401`: stop, the key is dead.
- One poller per process, not one per conversation.

# Notes

- Bot conversations are **not** auto-assigned and start **no response clock**
  until handoff. Deliberate: it keeps the agents' queue meaningful and stops the
  bot's speed being counted as human responsiveness.
- Replies to a chatbot conversation are **never emailed** to the visitor, even
  after they give an address. The conversation stays in your chat surface.
- Keys may carry an expiry. Rotation is: we issue a second key, you switch, we
  revoke the first — both work during the overlap.
