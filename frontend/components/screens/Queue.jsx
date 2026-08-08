'use client';

import {
  Button, CHECKBOX, CHECKBOX_STYLE, Dropdown, DropdownItem, EmptyState, LoadingSpinner,
  Skeleton, TonePill, UserAvatar,
} from '../common';
import { buttonVariants } from '../common/Button';

/** `Dropdown` wraps its trigger in a <button>, so the trigger itself is a span
    borrowing the Button recipe rather than a nested <Button>. */
const TRIGGER_SM = buttonVariants({ variant: 'outline', size: 'sm' });

/** Pill whose on/off colour comes from the console's [data-on] token pair. */
const ON_PILL_STYLE = {
  border: '1px solid var(--cs-onbd)',
  background: 'var(--cs-onbg)',
  color: 'var(--cs-onfg)',
  fontWeight: 'var(--cs-onw)',
};
const ON_PILL =
  'inline-flex items-center gap-1.5 rounded-full cursor-pointer whitespace-nowrap transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-ring';

const RAIL_HEAD = 'text-[12px] font-medium text-fg';
const BULK_BTN =
  'h-btn-sm px-3 rounded-full border-none text-[12.5px] text-white cursor-pointer transition-colors duration-[var(--dur-instant)] focus-ring';

const splitName = (n = '') => [n.split(' ')[0] ?? '', n.split(' ').slice(1).join(' ')];

export default function Queue({ V }) {
  const views = [
    ['all-open', 'all open', V.vAll, V.cAll],
    ['unassigned', 'no one yet', V.vUn, V.cUn],
    ['my-open', 'mine', V.vMy, V.cMy],
    ['breaching', 'needs attention', V.vBr, V.cBr],
    ['pending', 'waiting on them', V.vPd, V.cPd],
    ['resolved', 'recently closed', V.vRe, V.cRe],
    // Everything a chatbot opened, in any state. Bot-resolved conversations are
    // deliberately out of `all open` and `no one yet` — nobody should be paged
    // for work the bot finished — which made the AI's output invisible unless
    // you went hunting in `recently closed`. Seeing it and queueing it are
    // different needs.
    ['bot-handled', 'handled by AI', V.vBot, V.cBot],
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* saved views */}
      <div className="flex-none flex items-center gap-2 px-4 pt-2.5 overflow-hidden">
        <div data-scroll className="flex gap-[3px] flex-1 min-w-0 overflow-x-auto">
          {views.map(([v, label, on, count]) => (
            <button key={v} onClick={V.onView} data-v={v} data-on={String(on)} className={ON_PILL + ' h-btn-sm px-3 text-[13px]'} style={ON_PILL_STYLE}>
              {label}
              <span className="tabular-nums opacity-75">{count}</span>
            </button>
          ))}
          <Button
            variant="outline"
            size="icon"
            onClick={V.saveView}
            aria-label="save this filter set as a view"
            title="save this filter set as a view"
            className="flex-none"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Button>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex-none flex items-center gap-2.5 px-4 py-2.5 border-b border-[color:var(--border)]">
        <Button variant="outline" size="sm" onClick={V.toggleFilters} leftIcon={
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        }>filters</Button>

        <div className="flex-1 flex gap-1.5 flex-wrap min-w-0">
          {V.chips.map((chip, i) => (
            <button
              key={i}
              onClick={V.removeChip}
              data-k={chip.kind}
              data-v={chip.value}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-2 h-[22px] rounded-full border border-[color:var(--border)] bg-[color:var(--primary-soft)] text-fg text-[12px] cursor-pointer focus-ring"
            >
              <span className="text-fg-3">{chip.kind}</span>{chip.label}
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-60">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ))}
        </div>

        <span className="flex items-center gap-1.5 text-[12px] text-fg-3 tabular-nums">
          {/* The shared spinner, not an 11px CSS ring at 1.1s: 16px SVG at 1s. */}
          {V.loading && <LoadingSpinner size="sm" />}
          updated {V.refreshedRel}
        </span>

        <Button
          variant="outline"
          size="icon"
          onClick={V.refresh}
          aria-label="refresh the list"
          title="refresh"
          className="flex-none"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />
          </svg>
        </Button>

        <div className="w-px h-5 bg-[color:var(--border)]" />

        <Button variant="outline" size="sm" onClick={V.cycleDensity} title="row density" className="flex-none" leftIcon={
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        }>{V.densityLabel}</Button>

        <div className="flex-none">
          <Dropdown
            align="right"
            label="sort order"
            trigger={
              <span className={TRIGGER_SM}>
                sort: <span className="text-fg">{V.sortLabel}</span>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            }
          >
            {V.sortOptions.map((o) => (
              <DropdownItem key={o.id} onClick={() => V.setSort(o.id)}>
                {o.label}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* filter rail */}
        <aside
          data-filterrail
          data-scroll
          className="flex-none p-3.5 overflow-y-auto bg-surface border-r border-[color:var(--border)] flex flex-col gap-[18px]"
          style={{ width: 'var(--cs-filtw)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]">refine</span>
            <Button variant="link" size="sm" onClick={V.clearFilters} className="text-[12px]">clear filters</Button>
          </div>

          {V.facetGroups.map((g) => (
            <div key={g.kind} className="flex flex-col gap-[7px]">
              <span className={RAIL_HEAD}>{g.label}</span>
              {g.options.map((o) => (
                <label key={o.id} className="flex items-center gap-2.5 py-0.5 text-[13px] text-fg-2 cursor-pointer">
                  <input type="checkbox" checked={o.on} onChange={V.toggleFacet} data-k={g.kind} data-v={o.id} className={CHECKBOX} style={CHECKBOX_STYLE} />
                  <span className="flex-1">{o.label}</span>
                  <span className="tabular-nums text-[11.5px] opacity-80">{o.count}</span>
                </label>
              ))}
            </div>
          ))}

          <div className="flex flex-col gap-[7px]">
            <span className={RAIL_HEAD}>assignee</span>
            {V.assigneeOptions.map((o) => {
              const [first, last] = splitName(o.label.replace(/^me · /, ''));
              return (
                <button key={o.id} onClick={V.setAssigneeFilter} data-v={o.id} data-on={String(o.on)} className={ON_PILL + ' px-2 py-[5px] text-[12.5px] text-left'} style={ON_PILL_STYLE}>
                  <UserAvatar firstName={first} lastName={last} size="xs" />
                  <span className="flex-1 truncate">{o.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-[7px]">
            <span className={RAIL_HEAD}>team</span>
            <div className="flex gap-1.5 flex-wrap">
              {V.teamOptions.map((o) => (
                <button key={o.id} onClick={V.setTeamFilter} data-v={o.id} data-on={String(o.on)} className={ON_PILL + ' px-3 py-[5px] text-[12.5px]'} style={ON_PILL_STYLE}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <span className={RAIL_HEAD}>date range</span>
            <div className="flex gap-1.5 flex-wrap">
              {V.rangeOptions.map((o) => (
                <button key={o.id} onClick={V.setRange} data-v={o.id} data-on={String(o.on)} className={ON_PILL + ' px-3 py-[5px] text-[12.5px]'} style={ON_PILL_STYLE}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* list */}
        <section className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          <div
            className="flex-none grid items-center px-4 py-2 border-b border-[color:var(--border)] bg-bg text-[11px] uppercase tracking-[1.4px] text-fg-3"
            style={{ gridTemplateColumns: 'var(--cs-qcols)', gap: 'var(--cs-gap)' }}
          >
            <input type="checkbox" checked={V.allSelected} onChange={V.toggleAll} aria-label="select all conversations" className={CHECKBOX} style={CHECKBOX_STYLE} />
            <span>status</span><span data-col="prio">priority</span><span>subject</span><span>customer</span><span />
            <span data-col="tags">tags</span><span>sla</span>
            <span className="text-right">upd.</span>
          </div>

          <div data-scroll className="flex-1 overflow-y-auto">
            {V.loadingRows && V.skeletons.map((s) => (
              <div
                key={s.id}
                className="grid items-center px-4 h-[46px] border-b border-[color:var(--border)]"
                style={{ gridTemplateColumns: 'var(--cs-qcols)', gap: 'var(--cs-gap)' }}
              >
                <span />
                <Skeleton className="h-[18px] rounded-full" />
                <Skeleton className="h-[18px] rounded-full" />
                <Skeleton className="h-3 w-[70%] rounded-full" />
                <Skeleton className="h-3 rounded-full" />
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 rounded-full" />
                <Skeleton className="h-4 rounded-full" />
                <Skeleton className="h-2.5 rounded-full" />
              </div>
            ))}

            {V.hasError && (
              <EmptyState
                icon={<img src="/assets/mascots/mascot-05-waiting.svg" alt="" className="w-[84px] h-auto block" />}
                title="hmm, we couldn't load the inbox"
                description="nothing is lost — every conversation is safe. we'll try again whenever you're ready."
                action={{ label: 'try again', onClick: V.refresh }}
              />
            )}

            {V.isEmpty && (
              <EmptyState
                icon={
                  <img
                    src="/assets/mascots/mascot-01-listening.svg"
                    alt=""
                    className="w-[84px] h-auto block"
                    style={{ animation: 'cs-breathe 5.5s ease-in-out infinite' }}
                  />
                }
                title="nothing matches these filters ✿"
                description="that's allowed to be a good thing. widen the net whenever you like. no rush."
                action={{ label: 'clear filters', onClick: V.clearFilters }}
              />
            )}

            {V.rows.map((row) => {
              const [aFirst, aLast] = splitName(row.assigneeName);
              return (
                <div
                  key={row.id}
                  data-unread={String(row.unread)}
                  onClick={V.openRow}
                  onMouseEnter={V.onRowEnter}
                  onMouseLeave={V.onRowLeave}
                  data-id={row.id}
                  className="relative grid items-center px-4 border-b border-[color:var(--border)] cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2"
                  style={{ gridTemplateColumns: 'var(--cs-qcols)', gap: 'var(--cs-gap)', paddingTop: 'var(--cs-rowpy)', paddingBottom: 'var(--cs-rowpy)', fontSize: 'var(--cs-fs)' }}
                >
                  <span data-stop="1" onClick={V.stop} className="flex items-center">
                    <input type="checkbox" checked={row.selected} onChange={V.toggleSel} data-id={row.id} aria-label="select conversation" className={CHECKBOX} style={CHECKBOX_STYLE} />
                  </span>

                  <TonePill tone={row.statusTone} dot size="md">{row.statusLabel}</TonePill>

                  <span data-col="prio">
                    <TonePill tone={row.prioTone} size="md" glyph={<span className="text-[11px]">{row.prioGlyph}</span>}>
                      {row.prioLabel}
                    </TonePill>
                  </span>

                  <span className="min-w-0 flex flex-col gap-0.5">
                    <span className="flex items-center gap-[7px] min-w-0">
                      {row.unread && <i className="w-1.5 h-1.5 rounded-full flex-none bg-[color:var(--primary)]" />}
                      <span title={row.channelLabel} className="text-fg-3 flex flex-none">{row.channelGlyph}</span>
                      <span className="truncate" style={{ fontWeight: 'var(--cs-subjw)' }}>{row.subject}</span>
                      <span className="tabular-nums text-fg-3 text-[12px] flex-none">#{row.num}</span>
                    </span>
                    <span data-snip className="block truncate text-fg-3 text-[12.5px]">{row.snippet}</span>
                  </span>

                  <span className="min-w-0 flex flex-col">
                    <span className="truncate">{row.custName}</span>
                    <span className="truncate text-fg-3 text-[12px]">{row.custOrg}</span>
                  </span>

                  <UserAvatar firstName={aFirst} lastName={aLast} size="sm" />

                  <span data-col="tags" className="flex gap-1 items-center min-w-0">
                    {row.tagChips.map((t, i) => (
                      <TonePill key={i} tone={t.tone}>{t.label}</TonePill>
                    ))}
                    {row.hasMoreTags && <span className="text-[11.5px] text-fg-3">{row.tagMore}</span>}
                  </span>

                  <span data-tone={row.slaTone} title={row.slaTitle} className="inline-flex items-center gap-[7px] whitespace-nowrap">
                    <svg width="26" height="26" viewBox="0 0 32 32" className="flex-none">
                      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--surface-3)" strokeWidth="3" />
                      <circle cx="16" cy="16" r="12" fill="none" stroke={row.arcColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={row.arcDash} transform="rotate(-90 16 16)" />
                    </svg>
                    <span className="text-[11.5px] tabular-nums text-fg-3">{row.slaLabel}</span>
                  </span>

                  <span className="text-right text-fg-3 text-[12.5px] tabular-nums">{row.updated}</span>

                  <span
                    data-showq={String(row.hovered)}
                    data-stop="1"
                    onClick={V.stop}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 flex gap-[5px] p-1 rounded-full bg-surface border border-[color:var(--border)] shadow-card"
                    style={{ opacity: 'var(--q-op)', pointerEvents: 'var(--q-pe)' }}
                  >
                    <Button variant="ghost" size="icon" onClick={V.quickAssign} data-id={row.id} title="i'll take this" aria-label="i'll take this">
                      <img src="/assets/icons/icon-agent.svg" alt="" className="w-[15px] h-[15px] block" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={V.quickStatus} data-id={row.id} title="wait on them" aria-label="wait on them">
                      <img src="/assets/icons/icon-snooze.svg" alt="" className="w-[15px] h-[15px] block" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={V.quickOpen} data-id={row.id} title="open conversation" aria-label="open conversation">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 5h5v5M19 5l-7 7M18 14v4a1.8 1.8 0 01-1.8 1.8H6.8A1.8 1.8 0 015 18V8.8A1.8 1.8 0 016.8 7h4" />
                      </svg>
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex-none flex items-center justify-between gap-3 px-4 py-2.5 border-t border-[color:var(--border)] bg-surface text-[12.5px] text-fg-3">
            <span className="tabular-nums">{V.pageLabel}</span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={V.prevPage}>back</Button>
              <Button variant="outline" size="sm" onClick={V.nextPage}>next</Button>
            </div>
          </div>

          {V.hasSelection && (
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-[60px] z-fixed flex items-center gap-2 pl-4 pr-2.5 py-2 rounded-full shadow-modal whitespace-nowrap animate-slide-up"
              style={{ background: 'var(--plumo-night)', color: '#fff' }}
            >
              <span className="text-[13px] tabular-nums">{V.selCount} selected</span>
              <i className="w-px h-[18px] bg-white/20" />
              <button onClick={V.bulkAssign} className={BULK_BTN + ' bg-white/10 hover:bg-white/20'}>assign to me</button>
              <button onClick={V.bulkPending} className={BULK_BTN + ' bg-white/10 hover:bg-white/20'}>set pending</button>
              <button onClick={V.bulkTag} className={BULK_BTN + ' bg-white/10 hover:bg-white/20'}>flag for a look</button>
              <button
                onClick={V.bulkClose}
                className="h-btn-sm px-3 rounded-full border-none text-[12.5px] font-medium cursor-pointer transition-transform duration-[var(--dur-fast)] hover:scale-[1.02]"
                style={{ background: 'var(--plumo-butter)', color: 'var(--plumo-on-butter)' }}
              >
                close
              </button>
              {/* The bulk bar is a dark surface, so the ghost variant's
                  foreground/hover pair is overridden here — the geometry, the
                  press and the focus ring are the shared ones. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={V.clearSel}
                aria-label="clear selection"
                className="!text-white/70 hover:!bg-white/15 hover:!text-white"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
