'use client';

import { cn } from '@/lib/utils';
import { Breadcrumb, Button, Card, Dropdown, DropdownItem, Input, Segment, Skeleton, Textarea, TonePill, UserAvatar } from '../common';
import { buttonVariants } from '../common/Button';
import { KnowledgeBaseGlyph, SlaGlyph } from './glyphs';

/* Below `lg` the two panes become one at a time. PM's own answer for its issue
   detail is blunter — the rail is simply `hidden xl:block`
   (`issues/[id]/page.tsx:951`) — but PM's rail duplicates fields that also
   appear inline in its header, and CS's does not: the SLA targets, the customer
   card, the tags and the CSAT have no other home in this app, so hiding them
   outright would lose them rather than repeat them. Hence tabs, which is what
   item 42 asks for, on the `Segment` primitive CS already ships. */
const PANES = [
  { value: 'conversation', label: 'Conversation' },
  { value: 'details', label: 'Details' },
];

const ON_ROW_STYLE = { background: 'var(--cs-onbg)', color: 'var(--cs-onfg)', fontWeight: 'var(--cs-onw)' };

/** `Dropdown` renders its own <button> around whatever it is given, so a trigger
    must not be one itself — nesting buttons is invalid markup. PM's triggers are
    spans for the same reason; borrowing the Button recipe keeps the geometry. */
const TRIGGER_SM = buttonVariants({ variant: 'outline', size: 'sm' });
const TRIGGER_ICON = buttonVariants({ variant: 'outline', size: 'icon' });

/* The two searchable panels below stay hand-rolled — PM hand-rolls its
   searchable popovers too (`AssigneePopover`) because the shared primitive has
   no room for a query field. What they no longer keep is their own chrome: the
   offset, shadow, z-layer, padding and entry animation are `Dropdown`'s. */
const PANEL =
  'absolute z-dropdown w-max p-1 rounded-token bg-surface border border-[color:var(--border)] shadow-card animate-dropdown';
const MENU_ROW =
  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-token-sm border-none text-[13px] text-left cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-visible:bg-surface-2 focus-ring';
const RAIL_CARD = 'rounded-token border border-[color:var(--border)] p-4 flex flex-col';
const RAIL_LABEL = 'text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';
const RAIL_KV = 'flex justify-between gap-2.5 text-[12.5px] text-fg-3';
const Caret = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="10.5" width="14" height="9" rx="2.2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
  </svg>
);
const ClipIcon = ({ size = 13 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 7l-6.5 6.5a2.5 2.5 0 003.5 3.5L20 10a4.5 4.5 0 00-6.5-6.5L6 11a6.5 6.5 0 009 9l5-5" />
  </svg>
);

const splitName = (n = '') => [n.split(' ')[0] ?? '', n.split(' ').slice(1).join(' ')];

/**
 * Renders the inline markdown an AI assistant emits — **bold** and `code` — as
 * React elements, never as HTML.
 *
 * Message bodies are untrusted input: they come from a chatbot relaying whatever
 * a visitor typed. dangerouslySetInnerHTML here would be a stored-XSS hole in
 * the one screen every agent reads all day. Building elements instead means the
 * worst a hostile body can do is look odd.
 *
 * Deliberately only two tokens. Headings, links and images in a support
 * transcript are more risk and clutter than benefit; anything else stays literal,
 * including a list's leading "1.", which reads perfectly well as text.
 */
export function parseInline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    const tok = m[0];
    out.push(tok.startsWith('**')
      ? { type: 'bold', value: tok.slice(2, -2) }
      : { type: 'code', value: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

function RichText({ text }) {
  return (
    <>
      {parseInline(text).map((t, i) =>
        t.type === 'bold' ? <strong key={i} className="font-medium">{t.value}</strong>
        : t.type === 'code' ? <code key={i} className="px-1 py-0.5 rounded text-[13px] bg-surface-2 font-mono">{t.value}</code>
        : t.value,
      )}
    </>
  );
}

export default function Ticket({ V }) {
  const [custFirst, custLast] = splitName(V.custName);
  const [asgFirst, asgLast] = splitName(V.tAssigneeName);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Breadcrumb — PM puts one above the header block on every detail page
          (`IssueHeader.tsx:71-93`). CS has no router for the ancestors, so the
          crumbs above the leaf are labels rather than links; the primitive
          already renders an href-less item as a span. */}
      <div className="flex-none px-4 pt-3 bg-surface">
        <Breadcrumb
          items={[{ label: 'Home' }, { label: 'Inbox' }].concat(
            V.tNum ? [{ label: `#${V.tNum}` }] : [],
          )}
        />
      </div>

      {/* toolbar */}
      <div className="flex-none flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[color:var(--border)] bg-surface relative z-sticky">
        <Button variant="outline" size="icon" onClick={V.backToQueue} aria-label="Back to the inbox" title="Back to the inbox" className="flex-none">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Button>
        <span className="tabular-nums text-fg-3 text-[13px] flex-none">#{V.tNum}</span>

        {V.subjEdit && (
          <input
            value={V.subjDraft}
            onChange={V.onSubjDraft}
            onBlur={V.saveSubject}
            onKeyDown={V.onSubjKey}
            aria-label="Edit subject"
            autoFocus
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-token-sm border border-[color:var(--primary)] bg-surface text-fg text-[16px] font-medium outline-none focus-ring"
          />
        )}
        {V.subjNotEdit && (
          <button
            onClick={V.editSubject}
            title="Click to rename"
            className="flex-1 min-w-0 text-left px-2 py-1.5 rounded-token-sm border border-transparent bg-transparent text-fg text-[16px] font-medium tracking-[-.3px] cursor-text truncate transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 hover:border-[color:var(--border)] focus-ring"
          >
            {V.tSubject}
          </button>
        )}

        {/* status */}
        <div className="flex-none">
          <Dropdown
            align="left"
            label="Status"
            trigger={
              <span className={TRIGGER_SM}>
                <TonePill tone={V.tStatusTone} dot className="!bg-transparent !px-0">{V.tStatus}</TonePill>
                <Caret />
              </span>
            }
          >
            {V.statusOptions.map((o) => (
              <DropdownItem key={o.id} onClick={() => V.setStatus(o.id)}>
                <span className="flex items-center gap-2.5">
                  <i data-tone={o.tone} className="w-2 h-2 rounded-full flex-none" style={{ background: 'var(--tone-hue)' }} />
                  {o.label}
                </span>
              </DropdownItem>
            ))}
          </Dropdown>
        </div>

        {/* priority */}
        <div className="flex-none">
          <Dropdown
            align="left"
            label="Priority"
            trigger={
              <span className={TRIGGER_SM}>
                <TonePill tone={V.tPrioTone} glyph={<span className="text-[11px]">{V.tPrioGlyph}</span>} className="!bg-transparent !px-0">
                  {V.tPrio}
                </TonePill>
                <Caret />
              </span>
            }
          >
            {V.prioOptions.map((o) => (
              <DropdownItem key={o.id} onClick={() => V.setPriority(o.id)}>
                <span className="flex items-center gap-2.5">
                  <span data-tone={o.tone} className="w-4 text-center text-[11px]" style={{ color: 'var(--tone-fg)' }}>{o.glyph}</span>
                  {o.label}
                </span>
              </DropdownItem>
            ))}
          </Dropdown>
        </div>

        {/* assignee */}
        <div className="relative flex-none">
          <button
            onClick={V.openAssigneeMenu}
            aria-haspopup="menu"
            aria-expanded={V.assigneeOpen}
            className="inline-flex items-center gap-2 pl-1.5 pr-3 h-btn-md rounded-full border border-[color:var(--border)] bg-surface text-fg text-[13px] whitespace-nowrap cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-ring"
          >
            <UserAvatar firstName={asgFirst} lastName={asgLast} size="sm" />
            {V.tAssigneeName}
            <i data-tone="sla-met" className="w-[5px] h-[5px] rounded-full flex-none" style={{ background: 'var(--tone-hue)' }} />
            <span className="text-[12px] text-fg-3">On it</span>
            <Caret />
          </button>
          {V.assigneeOpen && (
            <div role="menu" className={PANEL + ' top-full mt-2 right-0 w-[262px] !p-2'}>
              <Input value={V.menuQ} onChange={V.onMenuQ} placeholder="Search agents…" aria-label="Search agents" className="!rounded-full mb-1.5" />
              <Button size="sm" onClick={V.assignMe} className="w-full mb-1 justify-start" variant="outline"
                style={{ background: 'var(--primary-soft)', color: 'var(--cs-brand-ink)' }}>
                Assign to me
              </Button>
              <div data-scroll className="max-h-[232px] overflow-y-auto">
                {V.agentList.map((a) => {
                  const [f, l] = splitName(a.name);
                  return (
                    <button key={a.id} role="menuitem" onClick={V.setAssignee} data-v={a.id} data-on={String(a.on)} className={MENU_ROW} style={ON_ROW_STYLE}>
                      <span className="relative flex-none">
                        <UserAvatar firstName={f} lastName={l} size="sm" />
                        <i data-tone={a.availTone} className="absolute -right-px -bottom-px w-2 h-2 rounded-full border-2 border-[color:var(--surface)]" style={{ background: 'var(--tone-hue)' }} />
                      </span>
                      <span className="flex-1">{a.name}</span>
                      <span className="text-[11.5px] text-fg-3">{a.role}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={V.unassign} role="menuitem" className="w-full px-2.5 py-2 mt-1 border-none border-t border-[color:var(--border)] bg-transparent text-fg-3 text-[13px] text-left cursor-pointer hover:text-fg focus-visible:bg-surface-2 focus-ring">
                Unassign
              </button>
            </div>
          )}
        </div>

        {/* team */}
        <div className="flex-none">
          <Dropdown
            align="right"
            label="Team"
            trigger={<span className={TRIGGER_SM + ' text-fg-3'}>{V.tTeam}<Caret /></span>}
          >
            {V.teamList.map((o) => (
              <DropdownItem key={o.id} onClick={() => V.setTeam(o.id)}>
                {o.label}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>

        {/* AI on/off — only for conversations a chatbot opened */}
        {V.isBotConversation && (
          <div className="flex-none">
            <button
              onClick={V.toggleBot}
              title={
                V.botEnabled
                  ? 'The assistant may reply to this conversation. Turn it off before you answer.'
                  : 'The assistant is silenced. Turn it back on to let it handle follow-ups.'
              }
              data-tone={V.botEnabled ? 'st-open' : 'st-pending'}
              className="inline-flex items-center gap-2 px-3 h-btn-md rounded-full border text-[13px] whitespace-nowrap cursor-pointer transition-colors duration-[var(--dur-instant)] focus-ring"
              style={{
                borderColor: 'color-mix(in srgb, var(--tone-hue) 34%, transparent)',
                background: 'color-mix(in srgb, var(--tone-hue) 12%, var(--surface))',
                color: 'var(--tone-fg)',
              }}
            >
              <i className="w-[6px] h-[6px] rounded-full flex-none" style={{ background: 'var(--tone-hue)' }} />
              {V.botEnabled ? 'AI is replying' : 'AI is off'}
            </button>
          </div>
        )}

        {/* overflow */}
        <div className="flex-none">
          <Dropdown
            align="right"
            label="More actions"
            trigger={
              <span className={TRIGGER_ICON}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="5.5" r=".7" /><circle cx="12" cy="12" r=".7" /><circle cx="12" cy="18.5" r=".7" />
                </svg>
              </span>
            }
          >
            {/* "add a tag" used to live here too and opened the same menu the
                rail's `+ add` chip opens. `Dropdown` keeps its open state to
                itself, so one menu can no longer reach into another; the rail
                chip is the single entry point now. */}
            <DropdownItem onClick={V.mergeTicket}>Merge into another conversation</DropdownItem>
            <DropdownItem onClick={V.copyLink}>Copy link</DropdownItem>
            <div className="h-px bg-[color:var(--border)] my-1" />
            <DropdownItem onClick={V.askSpam}>Mark as spam</DropdownItem>
            <DropdownItem variant="danger" onClick={V.askDelete}>Delete conversation</DropdownItem>
          </Dropdown>
        </div>

        {/* The rail toggle is a desktop control: below `lg` the tabs decide
            which pane is on screen, so a second, invisible switch on the same
            thing would only be a way to make the details tab render nothing. */}
        <Button variant="outline" size="icon" onClick={V.toggleRail} aria-label="Show or hide the details rail" title="Details rail" className="flex-none hidden lg:inline-flex">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16v14H4zM15 5v14" />
          </svg>
        </Button>
      </div>

      <div className="flex-none lg:hidden px-4 py-2 border-b border-[color:var(--border)] bg-surface">
        <Segment options={PANES} value={V.ticketPane} onChange={V.setTicketPane} />
      </div>

      {/* SLA strip */}
      <div
        data-tone={V.tSlaTone}
        className="flex-none flex flex-wrap items-center gap-x-3.5 gap-y-1 px-[18px] py-[7px] border-b border-[color:var(--border)] text-[12.5px] tabular-nums"
        style={{ background: 'color-mix(in srgb, var(--tone-hue) 9%, var(--surface))', color: 'var(--tone-fg)' }}
      >
        <span className="inline-flex items-center gap-[7px]">
          <SlaGlyph className="w-[15px] h-[15px] flex-none" />
          First response {V.frLabel}
        </span>
        <i className="w-px h-3.5 bg-current opacity-25" />
        <span>Resolution {V.resLabel}</span>
        <i className="w-px h-3.5 bg-current opacity-25" />
        <span className="opacity-80">{V.slaPolicy} policy</span>
        {V.tPaused && (
          <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-[color:var(--border)] text-fg-3">
            Paused
          </span>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        <div
          className={cn(
            'flex-1 min-w-0 flex-col bg-bg lg:flex',
            V.ticketPane === 'conversation' ? 'flex' : 'hidden',
          )}
        >
          {V.remote && (
            <div
              className="flex-none flex items-center gap-2.5 mx-[18px] mt-3 px-3.5 py-2.5 rounded-full text-[12.5px] animate-slide-up"
              style={{
                background: 'var(--primary-soft)',
                border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
                color: 'var(--cs-brand-ink)',
              }}
            >
              <i className="w-[7px] h-[7px] rounded-full flex-none bg-[color:var(--primary)]" />
              <span className="flex-1">A teammate added a reply while you were reading</span>
              <Button size="sm" onClick={V.reloadTicket}>Refresh</Button>
            </div>
          )}

          {V.ticketLoading && (
            <div className="flex-1 flex flex-col gap-3.5 px-[18px] py-5">
              <Skeleton className="h-[66px] w-[72%] rounded-token" />
              <Skeleton className="h-[86px] w-[84%] rounded-token self-end" />
              <Skeleton className="h-[52px] w-[64%] rounded-token" />
            </div>
          )}

          {/* thread */}
          <div ref={V.threadRef} data-scroll className="flex-1 min-h-0 overflow-y-auto px-[18px] pt-[18px] pb-2 flex flex-col gap-3">
            {V.thread.map((m) => {
              const [f, l] = splitName(m.author);
              return (
                <div key={m.id}>
                  {m.isEvent && (
                    <div className="flex items-center gap-3 py-0.5">
                      <i className="flex-1 h-px bg-[color:var(--border)]" />
                      <span className="text-[11.5px] text-fg-3 whitespace-nowrap">{m.body} · {m.rel} ago</span>
                      <i className="flex-1 h-px bg-[color:var(--border)]" />
                    </div>
                  )}
                  {m.isBubble && (
                    <div
                      data-side={m.sideKey}
                      className="flex gap-3 items-start max-w-[min(760px,100%)]"
                      style={{ marginLeft: 'var(--msg-ml)' }}
                    >
                      <span className="mt-0.5">
                        <UserAvatar firstName={f} lastName={l} size="md" />
                      </span>
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[13.5px] font-medium">{m.author}</span>
                          <span className="text-[11.5px] text-fg-3">{m.role}</span>
                          <span title={m.exact} className="text-[11.5px] text-fg-3 tabular-nums">{m.rel} ago</span>
                          {m.pending && <span className="text-[11.5px] text-fg-3">Sending…</span>}
                        </div>
                        <div
                          className="p-3.5 flex flex-col gap-2.5"
                          style={{
                            border: '1px solid var(--msg-bd)',
                            background: 'var(--msg-bg)',
                            borderRadius: 'var(--msg-r, var(--radius))',
                          }}
                        >
                          {m.isNote && (
                            <div data-tone="st-pending" className="inline-flex items-center gap-[7px] text-[11.5px] font-medium" style={{ color: 'var(--tone-fg)' }}>
                              <LockIcon />Only visible to your team
                            </div>
                          )}
                          {m.paras.map((p) => (
                            // whitespace-pre-wrap keeps single newlines: paragraphs are
                            // split on blank lines only, so an AI's numbered list would
                            // otherwise arrive as one unbroken wall of text.
                            <p key={p.id} className="text-[14px] leading-relaxed text-fg whitespace-pre-wrap break-words">
                              <RichText text={p.text} />
                            </p>
                          ))}
                          {m.hasFiles && (
                            <div className="flex gap-[7px] flex-wrap pt-0.5">
                              {m.files.map((file, i) => (
                                <Button key={i} variant="outline" size="sm" leftIcon={<ClipIcon />}>
                                  {file.name}<span className="text-fg-3">{file.size}</span>
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* suggested article */}
          <div className="mx-[18px] mb-3 px-3.5 py-3 rounded-[10px] bg-surface flex gap-2.5 items-start" style={{ border: '1px solid var(--cs-leafsoft)' }}>
            <span className="w-[22px] h-[22px] flex-none rounded-full grid place-items-center" style={{ background: 'var(--cs-leafsoft)' }}>
              <KnowledgeBaseGlyph className="w-[13px] h-[13px]" />
            </span>
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[12px] font-medium" style={{ color: 'var(--cs-brand-ink)' }}>This article might help</span>
              <span className="text-[12.5px] text-fg-3">Rotating an account key without locking anyone out</span>
            </div>
            <Button variant="outline" size="sm" onClick={V.mock} data-msg="Article added to your reply" className="whitespace-nowrap">
              Add to reply
            </Button>
          </div>

          {/* composer */}
          <div
            data-side={V.composerKey}
            className="flex-none mx-[18px] mb-[18px] rounded-token shadow-card flex flex-col"
            style={{ border: '1px solid var(--msg-bd)', background: 'var(--msg-bg)' }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[color:var(--border)] flex-wrap">
              <div className="flex gap-[3px] p-[3px] rounded-full bg-bg">
                <button onClick={V.setMode} data-m="reply" data-on={String(V.isReply)} className="px-3.5 h-[26px] rounded-full border-none text-[12.5px] cursor-pointer" style={ON_ROW_STYLE}>
                  Reply to customer
                </button>
                <button onClick={V.setMode} data-m="note" data-on={String(V.isNote)} className="px-3.5 h-[26px] rounded-full border-none text-[12.5px] cursor-pointer" style={ON_ROW_STYLE}>
                  Internal note
                </button>
              </div>
              {V.isNote && (
                <span data-tone="st-pending" className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--tone-fg)' }}>
                  <LockIcon />The customer never sees this
                </span>
              )}
              <span className="flex-1" />
              <span className="text-[11.5px] text-fg-3">Press R to jump here</span>
            </div>

            {/* Only the three overrides that let it sit flush inside the card
                survive: the card already draws the border, radius and fill.
                Size, padding and — the load-bearing one — the focus ring are
                the shared Textarea's own. */}
            <Textarea
              ref={V.replyRef}
              value={V.draft}
              onChange={V.onDraft}
              placeholder={V.composerPlaceholder}
              rows={4}
              className="!border-none !bg-transparent !rounded-none"
            />

            <div className="flex items-center gap-2 px-3 py-2.5 border-t border-[color:var(--border)] flex-wrap">
              <div className="flex gap-0.5">
                <Button variant="ghost" size="icon" aria-label="Bold" title="Bold" className="text-[13px]">B</Button>
                <Button variant="ghost" size="icon" aria-label="Italic" title="Italic" className="text-[13px] italic">i</Button>
                <Button variant="ghost" size="icon" aria-label="Bulleted list" title="List">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 7h11M9 12h11M9 17h11M5 7h.01M5 12h.01M5 17h.01" />
                  </svg>
                </Button>
                <Button variant="ghost" size="icon" aria-label="Add a link" title="Link">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a4 4 0 005.7 0l2.3-2.3a4 4 0 10-5.7-5.7L11 6.3" />
                    <path d="M14 11a4 4 0 00-5.7 0L6 13.3a4 4 0 105.7 5.7L13 17.7" />
                  </svg>
                </Button>
              </div>
              <i className="w-px h-5 bg-[color:var(--border)]" />

              <div className="relative">
                <Button variant="outline" size="sm" onClick={V.openCanned} leftIcon={
                  <KnowledgeBaseGlyph className="w-[15px] h-[15px] flex-none" />
                }>
                  Canned responses
                </Button>
                {V.cannedOpen && (
                  <div
                    role="menu"
                    data-scroll
                    className={PANEL + ' bottom-full mb-2 left-0 w-[340px] max-h-[330px] overflow-y-auto !p-2'}
                  >
                    <Input value={V.menuQ} onChange={V.onMenuQ} placeholder="Search responses…" aria-label="Search canned responses" className="!rounded-full mb-1.5" />
                    {V.cannedFiltered.map((r) => (
                      <button key={r.id} role="menuitem" onClick={V.insertCanned} data-v={r.id} className="w-full flex flex-col gap-0.5 px-2.5 py-2.5 rounded-token-sm border-none bg-transparent text-left cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-visible:bg-surface-2 focus-ring">
                        <span className="flex items-center gap-2 w-full">
                          <span className="flex-1 text-[13px] font-medium text-fg">{r.title}</span>
                          <span className="text-[11px] text-fg-3">{r.team}</span>
                        </span>
                        <span className="text-[12px] text-fg-3 leading-relaxed">{r.snippet}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button variant="outline" size="sm" leftIcon={<ClipIcon size={14} />}>Attach</Button>
              <span className="flex-1" />
              {/* `V.sending` has existed since the composer was written and
                  nothing ever showed it. `loading` also disables, so a second
                  click cannot post the same reply twice. */}
              <Button variant="outline" size="sm" onClick={V.onSendPending} loading={V.sending} className="whitespace-nowrap">Send &amp; set pending</Button>
              <Button variant="outline" size="sm" onClick={V.onSendResolved} loading={V.sending} className="whitespace-nowrap">Send &amp; resolve</Button>
              <Button size="md" onClick={V.onSend} loading={V.sending} className="whitespace-nowrap">{V.sendLabel}</Button>
            </div>
          </div>
        </div>

        {/* Details rail. Like the queue's filter rail this now answers to the
            toggle *and* the viewport, which the old `[data-cs-rail="off"]
            [data-rail]` selector could not express: at `lg` and up `railOn`
            decides, below it the tab does, and below `lg` it is full width
            rather than a 322px column beside nothing. */}
        <aside
          data-scroll
          className={cn(
            'flex-none overflow-y-auto p-3.5 bg-surface border-l border-[color:var(--border)] flex-col gap-3',
            'w-full lg:w-[var(--cs-railw)]',
            V.ticketPane === 'details' ? 'flex' : 'hidden',
            V.railOn ? 'lg:flex' : 'lg:hidden',
          )}
        >
          <div className={RAIL_CARD + ' gap-3'}>
            <div className="flex items-center gap-3">
              <UserAvatar firstName={custFirst} lastName={custLast} size="lg" />
              <div className="min-w-0 flex flex-col">
                <span className="text-[14px] font-medium">{V.custName}</span>
                <span className="text-[12px] text-fg-3">{V.custOrg}</span>
              </div>
            </div>
            <button
              onClick={V.copyLink}
              title="Copy email address"
              className="flex items-center gap-2 px-2.5 py-[7px] rounded-token-sm border border-[color:var(--border)] bg-bg text-fg text-[12.5px] text-left cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2"
            >
              <span className="flex-1 truncate">{V.custEmail}</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fg-3">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M15 5H6a1.8 1.8 0 00-1.8 1.8V15" />
              </svg>
            </button>
            <div className="flex flex-col gap-1.5">
              <span className={RAIL_KV}>Timezone <span className="text-fg">{V.custTz}</span></span>
              <span className={RAIL_KV}>Locale <span className="text-fg">{V.custLocale}</span></span>
            </div>
            <Button variant="link" size="sm" onClick={V.openCustomer} data-id={V.custId} className="self-start text-[12.5px]">
              View profile →
            </Button>
          </div>

          <div className={RAIL_CARD + ' gap-2.5'}>
            <span className={RAIL_LABEL}>sla</span>
            {[
              [V.frTone, 'First response', V.frLabel, V.frDue],
              [V.resTone, 'Resolution', V.resLabel, V.resDue],
            ].map(([tone, label, value, due]) => (
              <div
                key={label}
                data-tone={tone}
                className="flex flex-col gap-0.5 px-2.5 py-2.5 rounded-token-sm"
                style={{ background: 'color-mix(in srgb, var(--tone-hue) 10%, var(--surface))' }}
              >
                <span className="flex justify-between gap-2 text-[12.5px]">
                  <span className="text-fg-3">{label}</span>
                  <span className="tabular-nums" style={{ color: 'var(--tone-fg)' }}>{value}</span>
                </span>
                <span className="text-[11.5px] text-fg-3">Target {due}</span>
              </div>
            ))}
          </div>

          <div className={RAIL_CARD + ' gap-2'}>
            <span className={RAIL_LABEL}>details</span>
            <span className={RAIL_KV}>Channel <span className="text-fg">{V.tChannel}</span></span>
            <span className={RAIL_KV}>Created <span className="text-fg">{V.tCreated}</span></span>
            <span className={RAIL_KV}>Requester <span className="text-fg truncate max-w-[170px]">{V.tRequester}</span></span>
            <span className={RAIL_KV}>CC <span className="text-fg truncate max-w-[170px]">{V.tCc}</span></span>
            <span className={RAIL_KV}>Source <span className="text-fg">{V.tSource}</span></span>
            <span className={RAIL_KV}>Conversation ID <span className="text-fg tabular-nums">{V.tId}</span></span>
          </div>

          <div className={RAIL_CARD + ' gap-2.5'}>
            <span className={RAIL_LABEL}>tags</span>
            <div className="flex gap-1.5 flex-wrap">
              {V.tTags.map((g) => (
                <TonePill key={g.id} tone={g.tone} size="md" className="!pr-1.5">
                  {g.label}
                  <button
                    onClick={V.removeTag}
                    data-v={g.id}
                    aria-label="Remove tag"
                    className="grid place-items-center w-4 h-4 rounded-full border-none bg-transparent text-current cursor-pointer opacity-65 hover:opacity-100"
                  >
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </TonePill>
              ))}
              <div>
                <Dropdown
                  align="left"
                  label="Add a tag"
                  trigger={
                    <span className="inline-flex items-center gap-1 px-3 h-[22px] rounded-full border border-dashed border-[color:var(--border)] bg-transparent text-fg-3 text-[12px] transition-colors duration-[var(--dur-instant)] hover:text-[color:var(--primary)] hover:border-[color:var(--primary)]">
                      + Add
                    </span>
                  }
                >
                  {V.tagAddOptions.map((o) => (
                    <DropdownItem key={o.id} onClick={() => V.addTag(o.id)}>
                      <span className="flex items-center gap-2.5">
                        <i data-tone={o.tone} className="w-2 h-2 rounded-full flex-none" style={{ background: 'var(--tone-hue)' }} />
                        {o.label}
                      </span>
                    </DropdownItem>
                  ))}
                </Dropdown>
              </div>
            </div>
          </div>

          <div className={RAIL_CARD + ' gap-2.5'}>
            <span className={RAIL_LABEL}>how did we do?</span>
            <div className="flex gap-1.5 items-center">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className="w-6 h-6 rounded-full grid place-items-center text-[12px]"
                  style={{ background: 'var(--cs-leafsoft)', color: 'var(--cs-forest)', border: '1px solid var(--cs-forest)' }}
                >
                  ✓
                </span>
              ))}
              {[4, 5].map((n) => (
                <span key={n} className="w-6 h-6 rounded-full grid place-items-center text-[12px] bg-surface text-fg-3 border border-[color:var(--border)]">·</span>
              ))}
              <span className="ml-1 text-[12px] text-fg-3">Ines said 3 of 5</span>
            </div>
            <span className="text-[12px] text-fg-3 leading-relaxed">Asked once the conversation closes, never during.</span>
          </div>

          <div className={RAIL_CARD + ' gap-2.5'}>
            <span className={RAIL_LABEL}>activity</span>
            {V.activity.map((a) => (
              <div key={a.id} className="flex gap-2.5 items-start">
                <i className="flex-none w-1.5 h-1.5 rounded-full bg-[color:var(--border-strong)] mt-1.5" />
                <span className="text-[12.5px] text-fg-3 leading-relaxed">
                  <span className="text-fg">{a.who}</span> {a.what} · {a.rel} ago
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
