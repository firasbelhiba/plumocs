'use client';

import { Button, Progress, StatCard, TonePill, UserAvatar } from '../common';

const PANEL = 'rounded-token bg-surface border border-[color:var(--border)] shadow-card';
const THEAD =
  'grid gap-3 px-4 py-2.5 border-b border-[color:var(--border)] bg-bg text-[11px] uppercase tracking-[1.4px] text-fg-3';
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

export default function Reports({ V }) {
  return (
    <div data-scroll className="flex-1 min-h-0 overflow-y-auto px-6 py-[22px] flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-medium tracking-[-.6px]">reports</h2>
        <p className="text-[13px] text-fg-3">
          last 7 days, across both teams. no targets to beat — just a look at how it&apos;s going.
        </p>
      </div>

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
        <div data-anim="in" className={PANEL + ' p-5 flex flex-col gap-4 animate-fade-in'}>
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
              aria-label="close this breakdown"
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
              <span className="text-[13px] font-medium">how it splits</span>
              {V.drillBreakdown.map((b, i) => (
                <BarRow key={i} label={b.label} n={b.n} pct={b.wn} />
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] font-medium">conversations behind this</span>
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

      <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(320px,1.6fr) minmax(240px,1fr)' }}>
        <div className={PANEL + ' p-4 flex flex-col gap-3.5'}>
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="text-[13.5px] font-medium">created vs resolved</span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <i className="w-[9px] h-[9px] rounded-[3px] bg-[color:var(--primary)]" />created
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <i className="w-[9px] h-[9px] rounded-[3px] bg-[color:var(--plumo-sky)]" />resolved
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
          <span className="text-[13.5px] font-medium">where they come from</span>
          {V.byChannel.map((c, i) => (
            <BarRow key={i} label={c.label} n={c.n} pct={c.wn} />
          ))}
        </div>
      </div>

      <div className={PANEL + ' overflow-hidden'}>
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
              className="grid gap-3 px-4 py-2.5 border-b border-[color:var(--border)] last:border-b-0 items-center text-[13.5px]"
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
  );
}
