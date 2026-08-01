'use client';

import { Button, TonePill } from '../common';

export default function IndexScreen({ V }) {
  const chips = [
    { label: V.themeAction, onClick: V.toggleTheme },
    { label: `density: ${V.softLabel}`, onClick: V.cycleSoft },
    { label: 'inbox · all clear', onClick: V.demoEmpty },
    { label: "inbox · couldn't load", onClick: V.demoError },
    { label: 'shortcut sheet', onClick: V.openSheet },
  ];

  return (
    <div data-scroll className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-[18px]">
      <div className="flex items-start gap-3.5">
        <img
          src="/assets/mascots/mascot-10-customer-happy.svg"
          alt=""
          className="w-11 h-auto block"
          style={{ animation: 'cs-breathe 5.5s ease-in-out infinite' }}
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-[22px] font-medium tracking-[-.6px]">all pages</h2>
          <p className="text-[13px] text-fg-3 max-w-[56ch]">
            every screen in the console, with a way straight into it. this page is just for looking around —
            agents never see it.
          </p>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(258px,1fr))' }}>
        {V.pageCards.map((p, i) => (
          <button
            key={i}
            onClick={V.openPage}
            data-s={p.s}
            data-view={p.view}
            data-tab={p.tab}
            data-id={p.id}
            data-cust={p.cust}
            className="flex flex-col items-start gap-[7px] p-4 text-left cursor-pointer rounded-token bg-surface border border-[color:var(--border)] shadow-card transition-all duration-[var(--dur)] ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-1 hover:shadow-card-hover focus-ring"
          >
            <span className="flex items-center gap-2 w-full">
              <span className="text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]">
                {p.kind}
              </span>
              <span className="flex-1" />
              <TonePill tone={p.tone}>{p.state}</TonePill>
            </span>
            <span className="text-[16px] font-medium tracking-[-.3px] text-fg">{p.name}</span>
            <span className="text-[12.5px] text-fg-3 leading-relaxed">{p.blurb}</span>
            <span className="mt-0.5 text-[12.5px] text-[color:var(--primary)]">open →</span>
          </button>
        ))}
      </div>

      <div className="rounded-token border border-[color:var(--border)] bg-[color:var(--primary-soft)] p-4 flex flex-col gap-[11px]">
        <span className="text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]">
          states worth a look
        </span>
        <div className="flex gap-[7px] flex-wrap">
          {chips.map((c) => (
            <Button key={c.label} onClick={c.onClick} variant="secondary" size="sm">
              {c.label}
            </Button>
          ))}
          <button
            onClick={V.toggleFail}
            data-on={String(V.failMode)}
            className="h-btn-sm px-2.5 rounded-full text-xs cursor-pointer transition-transform duration-[var(--dur-fast)] hover:scale-[1.02] focus-ring"
            style={{
              border: '1px solid var(--cs-onbd)',
              background: 'var(--cs-onbg)',
              color: 'var(--cs-onfg)',
              fontWeight: 'var(--cs-onw)',
            }}
          >
            make saves fail: {V.failLabel}
          </button>
        </div>
        <span className="text-[12px] text-fg-2">
          with failing saves on, change a status or send a reply — it rolls back and says so, gently.
        </span>
      </div>
    </div>
  );
}
