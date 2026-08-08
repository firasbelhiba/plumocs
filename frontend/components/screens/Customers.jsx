'use client';

import { Breadcrumb, Button, Input, StatCard, TonePill, UserAvatar } from '../common';

/* Page padding and width from PM's reports page (`reports/page.tsx:313`):
   `p-4 md:p-8 max-w-[1400px] mx-auto`. PM puts those on a plain div inside a
   full-bleed scroll container; here the scroll container is the page, so the
   cap sits on it directly and the scrollbar rides the 1400px column. */
const PAGE =
  'flex-1 min-h-0 overflow-y-auto w-full max-w-[1400px] mx-auto p-4 md:p-8 flex flex-col gap-4';
/* Flat and bordered, no `shadow-card` — PM's card is shadowless 3 times in 4,
   and the shadow is kept for things that actually float. */
const PANEL = 'rounded-token bg-surface border border-[color:var(--border)] overflow-hidden';
/* Table header and row geometry from PM's reference table
   (`design-system/page.tsx:495,508`): the shared `h-row-header` / `h-row`
   utilities rather than fixed padding, `bg-surface-2` rather than the page
   background, semibold, and `tracking-wider` — CS's `tracking-[1.4px]` was
   nearly 3× PM's 0.05em. */
const THEAD =
  'grid gap-3 h-row-header px-3 border-b border-[color:var(--border)] bg-surface-2 items-center text-[11px] font-semibold uppercase tracking-wider text-fg-3';
const TROW =
  'grid gap-3 h-row px-3 border-b border-[color:var(--border)] last:border-b-0 items-center cursor-pointer text-[13px] text-fg ' +
  'transition-colors duration-[var(--dur-instant)] hover:bg-surface-2';

const LIST_COLS = 'minmax(180px,1.4fr) minmax(200px,1.6fr) minmax(140px,1fr) 84px 84px 110px';
const TICKET_COLS = '64px minmax(220px,1fr) 108px 96px 150px 90px';

const splitName = (n = '') => [n.split(' ')[0] ?? '', n.split(' ').slice(1).join(' ')];

export function Customers({ V }) {
  return (
    <div data-scroll className={PAGE}>
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">customers</h1>
          <p className="text-[13px] text-fg-2 mt-1">everyone who has written in, and how they&apos;re doing.</p>
        </div>
        <div className="w-[280px]">
          <Input
            value={V.custQ}
            onChange={V.onCustQ}
            placeholder="find a person or organisation…"
            aria-label="search customers"
            className="!rounded-full h-btn-md"
          />
        </div>
      </div>

      <div className={PANEL}>
        <div className={THEAD} style={{ gridTemplateColumns: LIST_COLS }}>
          <span>name</span><span>email</span><span>organisation</span>
          <span className="text-right">open</span>
          <span className="text-right">total</span>
          <span className="text-right">last contact</span>
        </div>
        {V.custRows.map((c) => {
          const [first, last] = splitName(c.name);
          return (
            <div key={c.id} onClick={V.openCustomer} data-id={c.id} className={TROW} style={{ gridTemplateColumns: LIST_COLS }}>
              <span className="flex items-center gap-2.5 min-w-0">
                <UserAvatar firstName={first} lastName={last} size="sm" />
                <span className="truncate">{c.name}</span>
              </span>
              <span className="text-fg-3 truncate">{c.email}</span>
              <span className="truncate">{c.orgName}</span>
              <span className="text-right tabular-nums">{c.open}</span>
              <span className="text-right tabular-nums text-fg-3">{c.total}</span>
              <span className="text-right tabular-nums text-fg-3">{c.lastRel} ago</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerProfile({ V }) {
  const [first, last] = splitName(V.cName);
  return (
    <div data-scroll className={PAGE}>
      {/* `cName` is '' until the customer lands (Console.jsx:1889), and an empty
          leaf still draws its own chevron — so the leaf is conditional, the same
          guard the Ticket and Settings crumbs use. */}
      <Breadcrumb
        items={[{ label: 'Home' }, { label: 'Customers' }].concat(
          V.cName ? [{ label: V.cName }] : [],
        )}
      />

      <Button
        onClick={V.go}
        data-s="customers"
        variant="outline"
        size="sm"
        className="self-start"
        leftIcon={
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        }
      >
        all customers
      </Button>

      <div className="rounded-token bg-surface border border-[color:var(--border)] p-4 flex items-start gap-4 flex-wrap">
        <UserAvatar firstName={first} lastName={last} size="xl" />
        <div className="flex-1 min-w-[200px] flex flex-col gap-1">
          <span className="text-[20px] font-medium tracking-[-.5px]">{V.cName}</span>
          <span className="text-[13px] text-fg-3">{V.cEmail} · {V.cOrg}</span>
          <span className="text-[13px] text-fg-3">{V.cPhone} · {V.cTz}</span>
        </div>
        <Button onClick={V.openNewTicket} size="md" className="whitespace-nowrap">
          start a conversation with {V.cName}
        </Button>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        <StatCard label="conversations all time" value={V.cTotal} />
        <StatCard label="open right now" value={V.cOpen} />
        <StatCard label="avg. resolution" value={V.cAvg} />
        <StatCard label="last seen ago" value={V.cLastSeen} />
      </div>

      <div className={PANEL}>
        <div className={THEAD} style={{ gridTemplateColumns: TICKET_COLS }}>
          <span>id</span><span>subject</span><span>status</span><span>priority</span><span>created</span>
          <span className="text-right">updated</span>
        </div>
        {V.custTickets.map((x) => (
          <div key={x.id} onClick={V.openRow} data-id={x.id} className={TROW} style={{ gridTemplateColumns: TICKET_COLS }}>
            <span className="tabular-nums text-fg-3">#{x.num}</span>
            <span className="truncate">{x.subject}</span>
            <span><TonePill tone={x.statusTone} dot size="md">{x.statusLabel}</TonePill></span>
            <span><TonePill tone={x.prioTone} size="md">{x.prioLabel}</TonePill></span>
            <span className="text-fg-3 text-[12.5px] tabular-nums">{x.created}</span>
            <span className="text-right text-fg-3 text-[12.5px] tabular-nums">{x.updated} ago</span>
          </div>
        ))}
      </div>
    </div>
  );
}
