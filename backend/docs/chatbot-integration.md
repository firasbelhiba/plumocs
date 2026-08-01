# Plumo CS — chatbot integration

For a third-party chatbot that files and follows support conversations. All
paths are relative to `https://<your-plumo-cs-host>/api/v1`.

## Before you start

- **Server-to-server only.** Authentication is an API key. A key in browser
  JavaScript is readable by anyone who views source, and it can file and read
  tickets for the whole support desk — so a browser widget must call *your*
  backend, which then calls this API. There is deliberately no CORS allowance.
- **One key is one chatbot.** Everything a chatbot creates is attributed back to
  its key. Two chatbots get two keys.
- **You will be given** a key (`plumo_sk_…`, shown once) and the scopes
  `chat:write` and `chat:read`.

Send the key on every request:

```
X-Api-Key: plumo_sk_…
```

## Identifiers

You send us a `sessionRef` — your own opaque id for a conversation. We return a
`ticketId` (a UUID). Store both.

We never return a ticket *number*. Numbers are display-only inside the Plumo
console and are not stable across the platform; the `ticketId` is stable forever.

## The flow

### 1. Open a conversation

```
POST /chat/conversations
{
  "sessionRef":    "conv_8f21",          // required, your id for this chat
  "visitorRef":    "user_5512",          // optional, your id for the person
  "visitorName":   "Leah Brenner",       // optional
  "visitorEmail":  "leah@example.com",   // optional
  "subject":       "Duplicate charge",   // optional, we derive one if absent
  "message":       "I was charged twice",// optional, becomes the first message
  "tags":          ["billing"]           // optional
}
→ { "ticketId": "…", "sessionRef": "conv_8f21", "status": "new",
    "handedOff": false, "created": true }
```

**Idempotent.** Calling it again with the same `sessionRef` returns the same
`ticketId` with `"created": false`. Safe to retry after a timeout.

`visitorEmail` is optional on purpose — an anonymous visitor is a first-class
case. If you supply one we match or create a customer by email; if you supply
only a `visitorRef` we track them as an anonymous visitor of your chatbot, and
the same `visitorRef` across conversations is recognised as the same person.

### 2. Append turns

```
POST /chat/conversations/{sessionRef}/messages
{
  "body":        "I can look that up for you.",
  "author":      "bot",        // "bot" or "visitor"
  "externalRef": "turn_17"     // optional but recommended
}
→ { "messageId": "…", "ticketId": "…", "duplicate": false }
```

**Idempotent when you send `externalRef`.** A retry returns the original
`messageId` with `"duplicate": true`. Without an `externalRef` a retry creates a
second message, so send one.

### 3. Hand off to a human

```
POST /chat/conversations/{sessionRef}/handoff
{ "reason": "billing dispute", "priority": "high" }   // both optional
→ { "ticketId": "…", "status": "open", "handedOffAt": "…",
    "alreadyHandedOff": false }
```

Call this when the bot cannot help. The conversation enters the agents' queue
and the response-time clock starts here — not when the conversation opened.
Calling it twice is harmless.

### 4. Or resolve it yourself

```
POST /chat/conversations/{sessionRef}/resolve
{ "outcome": "answered" }        // or "out_of_scope"
→ { "ticketId": "…", "status": "resolved", "alreadyResolved": false }
```

Rejected with `403` once a human has taken over — after handoff the conversation
belongs to the agent.

### 5. Receive agent replies

Poll for human replies you have not seen:

```
GET /chat/updates?since=2026-08-01T18:00:00.000Z&limit=50
→ {
    "cursor":  "2026-08-01T18:38:51.992Z",
    "hasMore": false,
    "updates": [
      { "messageId": "…", "sessionRef": "conv_8f21", "ticketId": "…",
        "status": "open", "body": "I refunded the duplicate charge.",
        "at": "2026-08-01T18:38:51.992Z" }
    ]
  }
```

Pass the returned `cursor` as the next `since`. Poll every 5–15 seconds.

Only messages written by human agents appear here — your own bot messages do
not, and neither do agents' internal notes to each other. If `hasMore` is true,
poll again immediately rather than waiting.

Omitting `since` returns the last 24 hours.

### Reading one conversation

```
GET /chat/conversations/{sessionRef}
→ { "ticketId": "…", "status": "…", "handedOff": false,
    "messages": [ { "id": "…", "author": "visitor|bot|agent",
                    "body": "…", "at": "…", "externalRef": "…" } ] }
```

## Errors

| Status | Meaning |
| --- | --- |
| `400` | Validation failed. Unknown fields are rejected, so do not send extras. |
| `401` | Key missing, revoked, or expired. An expired key says so explicitly. |
| `403` | Key lacks `chat:write` / `chat:read`, or a human owns the conversation. |
| `404` | No such conversation **for this key**. A `sessionRef` belonging to a different chatbot is indistinguishable from one that never existed. |
| `429` | Rate limited. Back off and retry. |

Body shape:

```json
{ "error": { "code": "NOT_FOUND", "message": "No such conversation" },
  "requestId": "req-42" }
```

Quote `requestId` when reporting a problem — it identifies the request in our logs.

## Limits

- Message body: 16,000 characters.
- `sessionRef`, `visitorRef`, `externalRef`: 200 characters.

## Notes

- Conversations opened by a chatbot are **not** auto-assigned to an agent and do
  not start a response-time clock until handoff. This is intentional: it keeps
  the agents' queue meaningful and stops the bot's own speed from being counted
  as human responsiveness.
- Replies to a chatbot conversation are never emailed to the visitor, even if
  they later give an email address. The conversation stays in your chat surface.
- Keys may carry an expiry. Rotation is: we issue a second key, you switch, we
  revoke the first — both work during the overlap.
