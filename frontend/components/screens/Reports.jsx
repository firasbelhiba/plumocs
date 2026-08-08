'use client';

import { cn } from '@/lib/utils';
import { Button, EmptyState, Progress, Skeleton, StatCard, TonePill, UserAvatar } from '../common';

/* PM's dominant card is flat and bordered — 64 shadowless instances against 21
   with `shadow-card` — so the shadow is reserved for things that float
   (menus, the queue's hover quick-actions). Padding comes from the caller;
   PM's padded card is `p-4`. */
const PANEL = 'rounded-token bg-surface border border-[color:var(--border)]';
/* Table header and row geometry from PM's reference table
   (`design-system/page.tsx:495,508`): the shared `h-row-header` / `h-row`
   utilities rather than fixed padding, `bg-surface-2` rather than the page
   background, semibold, and `tracking-wider` — CS's `tracking-[1.4px]` was
   nearly 3× PM's 0.05em. */
const THEAD =
  'grid gap-3 h-row-header px-3 border-b border-[color:var(--border)] bg-surface-2 items-center text-[11px] font-semibold uppercase tracking-wider text-fg-3';
const TROW =
  'grid gap-3 h-row px-3 border-b border-[color:var(--border)] last:border-b-0 items-center text-[13px] text-fg';
const AGENT_COLS = 'minmax(200px,1fr) 100px 110px 120px';
const EYEBROW = 'text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';

const splitName = (n = '') => [n.split(' ')[0] ?? '', n.split(' ').slice(1).join(' ')];

/** A labelled bar — shared by the drill-down split and the channel breakdown. */
function BarRow({ label, n, pct }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex justify-between text-[12.5px] text-fg-3">
        {label}
        <span className="text-fg tabular-nums">{n}</span>
      </span>
      <Progress value={pct} />
    </div>
  );
}

/**
 * The page's shape, held while its ten numbers are in flight.
 *
 * This screen had no loading state at all: for the whole of the fetch it was
 * three headings and a bare legend over white space, and then five KPI cards, a
 * chart and an agent table appeared at once and shoved everything down. Every
 * block below reuses the constant its real counterpart uses — `PANEL`, `THEAD`,
 * `AGENT_COLS`, the 184px chart box, the `minmax(168px,1fr)` KPI grid — so the
 * layout is defined once and the swap is invisible.
 */
function BarSkeleton({ i }) {
  // The same fixed height table PM's DashboardSkeleton uses, so the bars read as
  // data rather than as a row of equal blocks.
  const HEIGHTS = [55, 40, 70, 50, 85, 45, 60, 35, 75, 50];
  return (
    <div className="flex-1 flex flex-col items-center justify-end gap-[7px] h-full">
      <div className="w-full flex items-end justify-center gap-1" style={{ height: '100%' }}>
        <Skeleton className="w-[42%] rounded-token-sm" style={{ height: `${HEIGHTS[i % 10]}%`, animationDelay: `${i * 100}ms` }} />
        <Skeleton className="w-[42%] rounded-token-sm" style={{ height: `${HEIGHTS[(i + 3) % 10]}%`, animationDelay: `${i * 100 + 50}ms` }} />
      </div>
      <Skeleton className="h-2.5 w-6 rounded-full" style={{ animationDelay: `${i * 100}ms` }} />
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))' }}>
        {/* `StatCard`'s own box, measured: p-4 around a 14px `leading-tight`
            label, `mt-2`, and a 32px `text-2xl` value row — 88px. The first
            pass drew a 10px label and a 28px value with no line boxes, came to
            80, and every card, chart and table below it moved 8px when the
            numbers landed. */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface rounded-token border border-[color:var(--border)] shadow-card p-4">
            <div className="flex items-center h-[14px]">
              <Skeleton className="h-2.5 w-24 rounded-full" style={{ animationDelay: `${i * 100}ms` }} />
            </div>
            <div className="mt-2 flex items-center gap-2 h-8">
              <Skeleton className="h-7 w-16 rounded-token-sm" style={{ animationDelay: `${i * 100 + 50}ms` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-[minmax(320px,1.6fr)_minmax(240px,1fr)]">
        <div className={PANEL + ' p-4 flex flex-col gap-3.5'}>
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="text-[13.5px] font-medium">Created vs resolved</span>
          </div>
          <div className="flex items-end gap-3.5 h-[184px]">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <BarSkeleton key={i} i={i} />)}
          </div>
        </div>

        <div className={PANEL + ' p-4 flex flex-col gap-3'}>
          <span className="text-[13.5px] font-medium">Where they come from</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 rounded-full" style={{ width: `${52 + ((i * 11) % 26)}%`, animationDelay: `${i * 100}ms` }} />
              <Skeleton className="h-1.5 w-full rounded-full" style={{ animationDelay: `${i * 100 + 40}ms` }} />
            </div>
          ))}
        </div>
      </div>

      <div className={PANEL + ' overflow-hidden'}>
        <div className="overflow-x-auto">
          <div className={THEAD} style={{ gridTemplateColumns: AGENT_COLS }}>
            <span>agent</span>
            <span className="text-right">open</span>
            <span className="text-right">resolved</span>
            <span className="text-right">avg. time</span>
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={TROW} style={{ gridTemplateColumns: AGENT_COLS }}>
              <span className="flex items-center gap-2.5">
                <Skeleton variant="circular" className="h-6 w-6 flex-none" style={{ animationDelay: `${i * 100}ms` }} />
                <Skeleton className="h-3 rounded-full" style={{ width: `${44 + ((i * 9) % 26)}%`, animationDelay: `${i * 100}ms` }} />
              </span>
              <Skeleton className="h-3 w-8 justify-self-end rounded-full" style={{ animationDelay: `${i * 100 + 30}ms` }} />
              <Skeleton className="h-3 w-8 justify-self-end rounded-full" style={{ animationDelay: `${i * 100 + 60}ms` }} />
              <Skeleton className="h-3 w-12 justify-self-end rounded-full" style={{ animationDelay: `${i * 100 + 90}ms` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Reports({ V }) {
  return (
    // Page padding and width from PM's reports page (`reports/page.tsx:313`):
    // `p-4 md:p-8 max-w-[1400px] mx-auto`. PM puts those on a plain div inside
    // a full-bleed scroll container; here the scroll container is the page, so
    // the cap sits on it directly and the scrollbar rides the 1400px column.
    <div data-scroll className="flex-1 min-h-0 overflow-y-auto w-full max-w-[1400px] mx-auto p-4 md:p-8 flex flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-fg">Reports</h1>
        <p className="text-[13px] text-fg-2 mt-1">
          Last 7 days, across both teams.
        </p>
      </div>

      {V.reportsLoading && <ReportsSkeleton />}

      {V.reportsFailed && (
        <EmptyState
          illustration="error"
          title="Couldn't load the reports"
          description="The numbers didn't come back. Nothing on the desk has changed."
          action={{ label: 'Try again', onClick: V.retryReports }}
        />
      )}

      {/* A failed *refresh* keeps the last numbers and says they are the last
          numbers. Before this the catch was empty, so the previous run's KPIs
          stayed under the heading "Last 7 days" indefinitely with nothing to say
          they were neither current nor confirmed. */}
      {V.reportsStaleError && (
        <div className="flex flex-wrap items-center gap-2.5 px-3 py-2 rounded-token-sm bg-[color:var(--danger-soft)] text-[color:var(--danger)] text-[12.5px]">
          <span className="flex-1 min-w-[200px]">Couldn&apos;t refresh — these are the last figures that loaded.</span>
          <button
            onClick={V.retryReports}
            className="h-btn-sm px-3 rounded-full border border-current bg-transparent text-current text-[12.5px] cursor-pointer focus-ring"
          >
            Try again
          </button>
        </div>
      )}

      {!V.reportsLoading && !V.reportsFailed && (
      <div className={cn('flex flex-col gap-4 transition-opacity duration-200', V.reportsRefreshing && 'opacity-60 pointer-events-none')}>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))' }}>
        {/* StatCard is a plain surface in the shared library — wrap it to make
            the KPI a drill-down affordance without forking the component. */}
        {V.kpis.map((k) => (
          <button
            key={k.id}
            onClick={V.setDrill}
            data-k={k.id}
            className="text-left rounded-token transition-transform duration-[var(--dur)] ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-1 focus-ring"
          >
            <StatCard label={k.label} value={k.value} delta={k.delta} />
          </button>
        ))}
      </div>

      {V.drillOpen && (
        <div className={PANEL + ' p-4 flex flex-col gap-4 animate-fade-in'}>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px] flex flex-col gap-1">
              <span className={EYEBROW}>last 14 days</span>
              <span className="text-[17px] font-medium tracking-[-.4px]">{V.drillTitle}</span>
              <span className="text-[13px] text-fg-3 leading-relaxed">{V.drillNote}</span>
            </div>
            <span className="text-[30px] font-medium tracking-[-1px] tabular-nums">{V.drillValue}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={V.clearDrill}
              aria-label="Close this breakdown"
              className="flex-none"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-[120px] overflow-visible">
              <polyline
                points={V.drillPoints}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="flex justify-between text-[11.5px] text-fg-3 tabular-nums">
              <span>{V.drillFirst} · 14 days ago</span>
              <span>{V.drillAxis}</span>
              <span>{V.drillLast} · today</span>
            </div>
          </div>

          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] font-medium">How it splits</span>
              {V.drillBreakdown.map((b, i) => (
                <BarRow key={i} label={b.label} n={b.n} pct={b.wn} />
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] font-medium">Conversations behind this</span>
              {/* These three used to be fetched for all five KPIs during
                  loadReports, blocking the numbers above on data for a panel
                  that is shut until a card is clicked. They are fetched when the
                  panel opens now, so they have their own small wait. */}
              {V.drillTicketsLoading && [0, 1, 2].map((i) => (
                // 39px, not 34: `px-2.5 py-2` around a 21px text row plus the
                // border is what the real button measures, and three rows two
                // pixels short each is a 15px shuffle when they land.
                <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-token-sm border border-[color:var(--border)] bg-bg h-[39px]" aria-hidden="true">
                  <Skeleton className="h-2.5 w-8 rounded-full" style={{ animationDelay: `${i * 100}ms` }} />
                  <Skeleton className="h-2.5 flex-1 rounded-full" style={{ maxWidth: `${58 + ((i * 13) % 26)}%`, animationDelay: `${i * 100 + 40}ms` }} />
                  <Skeleton className="h-4 w-14 rounded-full" style={{ animationDelay: `${i * 100 + 80}ms` }} />
                </div>
              ))}
              {V.drillTicketsFailed && (
                <span className="text-[12.5px] text-[color:var(--danger)]">
                  Couldn&apos;t load the examples. The breakdown above is unaffected.
                </span>
              )}
              {V.drillTickets.map((x) => (
                <button
                  key={x.id}
                  onClick={V.openRow}
                  data-id={x.id}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-token-sm border border-[color:var(--border)] bg-bg text-left text-fg cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-ring"
                >
                  <span className="text-[12px] text-fg-3 tabular-nums">#{x.num}</span>
                  <span className="flex-1 text-[12.5px] truncate">{x.subject}</span>
                  <TonePill tone={x.statusTone}>{x.statusLabel}</TonePill>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* A two-column split whose narrower track alone is 320px cannot hold at
          375. PM's idiom for exactly this is one column until the breakpoint,
          the pair after it (`ProjectsDetailedView.tsx:59`). */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-[minmax(320px,1.6fr)_minmax(240px,1fr)]">
        <div className={PANEL + ' p-4 flex flex-col gap-3.5'}>
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="text-[13.5px] font-medium">Created vs resolved</span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <i className="w-[9px] h-[9px] rounded-[3px] bg-[color:var(--primary)]" />Created
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <i className="w-[9px] h-[9px] rounded-[3px] bg-[color:var(--plumo-sky)]" />Resolved
            </span>
          </div>
          <div className="flex items-end gap-3.5 h-[184px]">
            {V.volume.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-[7px] h-full">
                <svg viewBox="0 0 40 100" preserveAspectRatio="none" className="flex-1 w-full h-full overflow-visible">
                  <rect x="1" y={v.yC} width="17" height={v.hC} rx="2" fill="var(--primary)" />
                  <rect x="22" y={v.yR} width="17" height={v.hR} rx="2" fill="var(--plumo-sky)" />
                </svg>
                <span className="text-[11.5px] text-fg-3">{v.d}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={PANEL + ' p-4 flex flex-col gap-3'}>
          <span className="text-[13.5px] font-medium">Where they come from</span>
          {V.byChannel.map((c, i) => (
            <BarRow key={i} label={c.label} n={c.n} pct={c.wn} />
          ))}
        </div>
      </div>

      {/* PM scrolls a too-wide table inside its own panel rather than letting it
          push the page (`users/page.tsx:696`). `AGENT_COLS` has a 530px floor,
          so below `md` it scrolls here instead of scrolling the document. */}
      <div className={PANEL + ' overflow-hidden'}>
        <div className="overflow-x-auto">
        <div className={THEAD} style={{ gridTemplateColumns: AGENT_COLS }}>
          <span>agent</span>
          <span className="text-right">open</span>
          <span className="text-right">resolved</span>
          <span className="text-right">avg. time</span>
        </div>
        {V.byAgent.map((a) => {
          const [first, last] = splitName(a.name);
          return (
            <div
              key={a.id}
              className={TROW}
              style={{ gridTemplateColumns: AGENT_COLS }}
            >
              <span className="flex items-center gap-2.5">
                <UserAvatar firstName={first} lastName={last} size="sm" />
                {a.name}
              </span>
              <span className="text-right tabular-nums">{a.open}</span>
              <span className="text-right tabular-nums">{a.resolved}</span>
              <span className="text-right tabular-nums text-fg-3">{a.avg}</span>
            </div>
          );
        })}
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
