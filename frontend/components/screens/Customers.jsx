'use client';

import { cn } from '@/lib/utils';
import { Breadcrumb, Button, EmptyState, Input, Skeleton, StatCard, TonePill, UserAvatar } from '../common';

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

/**
 * Skeleton rows for either table on this screen.
 *
 * It takes the same `cols` string the real row is given and wears the same
 * `TROW` height, which is the whole point: the skeleton and the row it stands in
 * for cannot drift, because there is one definition of the geometry and both
 * read it. Cell widths jitter per row and the shimmer is staggered 100ms a step,
 * the two details that stop a block of identical bars pulsing as one slab
 * (PM `DashboardSkeleton`, `NavItemsSkeleton`).
 */
function RowSkeletons({ cols, cells, rows = 6 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <div key={i} className={TROW + ' !cursor-default'} style={{ gridTemplateColumns: cols }} aria-hidden="true">
      {cells.map((width, c) => (
        <Skeleton
          key={c}
          className="h-3 rounded-full"
          style={{
            width: typeof width === 'number' ? `${width - ((i * 5) % 14)}%` : width,
            animationDelay: `${i * 100 + c * 30}ms`,
          }}
        />
      ))}
    </div>
  ));
}

/**
 * A stat whose number has not arrived.
 *
 * `StatCard` renders whatever it is given, so an unknown has to be a node rather
 * than a fallback zero. The 32px box is the height `font-mono text-2xl` gives
 * the real figure — measured, both states: a 24px bar made the card 80px against
 * the real 88 and dropped the conversation table 8px on land.
 */
const StatValue = ({ value }) =>
  value == null ? (
    <span className="flex items-center h-8" aria-hidden="true">
      <Skeleton className="h-6 w-14 rounded-token-sm" />
    </span>
  ) : (
    <>{value}</>
  );

export function Customers({ V }) {
  return (
    <div data-scroll className={PAGE}>
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">Customers</h1>
          <p className="text-[13px] text-fg-2 mt-1">Everyone who has written in, and how they&apos;re doing.</p>
        </div>
        <div className="w-[280px]">
          <Input
            value={V.custQ}
            onChange={V.onCustQ}
            placeholder="Search people or organisations…"
            aria-label="Search customers"
            className="!rounded-full h-btn-md"
          />
        </div>
      </div>

      {/* The list failed. It used to fail silently: with /customers returning
          500, typing a name that matches nobody left all fourteen customers on
          screen, presented as the matches. */}
      {V.custFailed && (
        <EmptyState
          illustration="error"
          title="Couldn't load your customers"
          description="The list didn't come back. Nothing has changed on the desk."
          action={{ label: 'Try again', onClick: V.retryCustomers }}
        />
      )}

      {/* `LIST_COLS` has a 798px floor. PM's answer for a table wider than its
          container is to scroll it inside the panel (`users/page.tsx:696`),
          not to let it widen the page. */}
      {!V.custFailed && (
      <div className={PANEL}>
        {/* A failed REFRESH keeps the table and says so above it, exactly as the
            queue does. The full illustration above is for a first load, which
            has no rows to protect; replacing a table somebody is reading because
            a background call failed loses their place and tells them less. */}
        {V.custStaleError && (
          <div className="flex flex-wrap items-center gap-2.5 px-3 py-2 border-b border-[color:var(--border)] bg-[color:var(--danger-soft)] text-[color:var(--danger)] text-[12.5px]">
            <span className="flex-1 min-w-[180px]">Couldn&apos;t refresh — showing the last list that loaded.</span>
            <button
              onClick={V.retryCustomers}
              className="h-btn-sm px-3 rounded-full border border-current bg-transparent text-current text-[12.5px] cursor-pointer focus-ring"
            >
              Try again
            </button>
          </div>
        )}
        <div className={cn('overflow-x-auto transition-opacity duration-200', V.custRefreshing && 'opacity-60 pointer-events-none')}>
        <div className={THEAD} style={{ gridTemplateColumns: LIST_COLS }}>
          <span>name</span><span>email</span><span>organisation</span>
          <span className="text-right">open</span>
          <span className="text-right">total</span>
          <span className="text-right">last contact</span>
        </div>
        {/* Six column headings floating over white space for the whole round
            trip was the entire loading state this screen had. */}
        {V.custLoading && <RowSkeletons cols={LIST_COLS} cells={[70, 82, 60, '38%', '38%', '62%']} />}
        {V.custEmpty && (
          <div className="px-3 py-10 text-center text-[13px] text-fg-3">
            {V.custQ ? 'Nobody here matches that.' : 'Nobody has written in yet.'}
          </div>
        )}
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
      )}
    </div>
  );
}

export function CustomerProfile({ V }) {
  const [first, last] = splitName(V.cName);
  /* Everything below the header is the person's own record, so it is drawn
     once, when there is a person. Rendering it early gave a `?` avatar, a bare
     `·` where the name goes, a CTA trailing off as "Start a conversation with",
     and — the one that was actually false — "Open right now: 0" for somebody
     with two open conversations. */
  const pending = V.customerLoading || (!V.customerReady && !V.customerFailed);

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
        All customers
      </Button>

      {V.customerFailed && (
        <EmptyState
          illustration="error"
          title="Couldn't load this customer"
          description="Their record didn't come back. The conversation history is unaffected."
          action={{ label: 'Try again', onClick: V.retryCustomer }}
        />
      )}

      {!V.customerFailed && (
      <>
      {/* Identity card — same padding, same avatar size, same three text lines
          as the real one, so the header does not resize when the name lands.
          The three boxes below are the measured heights of the lines they stand
          in for: `text-[20px]` gives 33px, the two `text-[13px]` rows 21px, and
          `size="xl"` is a 48px avatar. The first pass used 56/20/12/12 and the
          card came out 98px against the real 118 — a 20px drop of everything
          under it, stats and conversation table included, at the moment the
          name arrived. */}
      <div className="rounded-token bg-surface border border-[color:var(--border)] p-4 flex items-start gap-4 flex-wrap">
        {pending ? (
          <>
            <Skeleton variant="circular" className="h-12 w-12 flex-none" />
            <div className="flex-1 min-w-[200px] flex flex-col gap-1" aria-hidden="true">
              <span className="flex items-center h-[33px]"><Skeleton className="h-5 w-44 rounded-token-sm" /></span>
              <span className="flex items-center h-[21px]"><Skeleton className="h-3 w-64 max-w-full rounded-full" style={{ animationDelay: '60ms' }} /></span>
              <span className="flex items-center h-[21px]"><Skeleton className="h-3 w-52 max-w-full rounded-full" style={{ animationDelay: '120ms' }} /></span>
            </div>
            <Skeleton className="h-btn-md w-56 max-w-full rounded-token-sm" style={{ animationDelay: '90ms' }} />
          </>
        ) : (
          <>
            <UserAvatar firstName={first} lastName={last} size="xl" />
            <div className="flex-1 min-w-[200px] flex flex-col gap-1">
              <span className="text-[20px] font-medium tracking-[-.5px]">{V.cName}</span>
              <span className="text-[13px] text-fg-3">{V.cEmail} · {V.cOrg}</span>
              <span className="text-[13px] text-fg-3">{V.cPhone} · {V.cTz}</span>
            </div>
            <Button onClick={V.openNewTicket} size="md" className="whitespace-nowrap">
              Start a conversation with {V.cName}
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        <StatCard label="Conversations all time" value={<StatValue value={V.cTotal} />} />
        <StatCard label="Open right now" value={<StatValue value={V.cOpen} />} />
        <StatCard label="Avg. resolution" value={<StatValue value={V.cAvg} />} />
        <StatCard label="Last seen" value={<StatValue value={V.cLastSeen} />} />
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
        <div className={THEAD} style={{ gridTemplateColumns: TICKET_COLS }}>
          <span>id</span><span>subject</span><span>status</span><span>priority</span><span>created</span>
          <span className="text-right">updated</span>
        </div>
        {pending && <RowSkeletons cols={TICKET_COLS} cells={['70%', 82, '64%', '58%', '76%', '54%']} rows={4} />}
        {!pending && V.custTickets.length === 0 && (
          <div className="px-3 py-10 text-center text-[13px] text-fg-3">
            No conversations with {V.cName} yet.
          </div>
        )}
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
      </>
      )}
    </div>
  );
}
