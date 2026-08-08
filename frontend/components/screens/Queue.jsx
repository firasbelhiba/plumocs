'use client';

import { cn } from '@/lib/utils';
import {
  Button, CHECKBOX, CHECKBOX_STYLE, Dropdown, DropdownItem, EmptyState, LoadingSpinner,
  Skeleton, TonePill, UserAvatar,
} from '../common';
import { buttonVariants } from '../common/Button';
import { AgentGlyph, SnoozeGlyph } from './glyphs';

/* The column set, at Tailwind's shared breakpoints instead of CS's 1400 / 1180.
   Below `md` there is no grid at all — the row is a stacked card, which CS had
   no equivalent of at any width — and above it columns are *added* as room
   appears rather than dropped as it runs out.

   The budget each step has to fit inside, at its own narrowest width and with
   every rail the step allows:

     md   768 − 236 rail − 24 px-3                     = 508  →  294 used
     lg  1024 − 236 rail − 216 filter rail − 24        = 548  →  406 used
     xl  1280 − 236 − 216 − 24                         = 804  →  644 used
     2xl 1536 − 236 − 216 − 24                         = 1060 →  774 used

   That is why priority waits for `lg`, customer and assignee for `xl`, and tags
   for `2xl` — CS's old set gave the full nine columns from 1400px up, and only
   fitted them by force-collapsing the rail to 64px, which is the override item
   42 exists to remove. The subject track is `minmax(0,1fr)` at every step: its
   old 180–220px floor is what pushed the total past the container and clipped
   the right-hand columns instead of shrinking the one that truncates anyway. */
const QCOLS =
  'md:grid-cols-[26px_92px_minmax(0,1fr)_82px_46px] ' +
  'lg:grid-cols-[28px_96px_88px_minmax(0,1fr)_84px_50px] ' +
  'xl:grid-cols-[28px_100px_92px_minmax(0,1fr)_168px_32px_88px_52px] ' +
  '2xl:grid-cols-[28px_100px_92px_minmax(0,1fr)_168px_32px_118px_88px_52px]';

/* Every one of these is on the stacked card, where there is vertical room for
   all of it, then hidden at `md` and re-admitted at the step whose budget above
   can pay for it. Column order in the DOM is checkbox, status, priority,
   subject, customer, assignee, tags, sla, updated — the same order as each
   template, which is what keeps the counts matching. */
const COL_PRIO = 'block md:hidden lg:block';
const COL_CUST = 'flex md:hidden xl:flex';
const COL_AV = 'flex md:hidden xl:flex';
const COL_TAGS = 'flex md:hidden 2xl:flex';

/* `md:contents` is what lets one row serve both layouts: below `md` these two
   wrappers are the card's badge line and meta line, and from `md` up they
   dissolve so their children become direct grid items in the template above. */
const CARD_LINE = 'flex items-center gap-2 min-w-0 md:contents';

/** `Dropdown` wraps its trigger in a <button>, so the trigger itself is a span
    borrowing the Button recipe rather than a nested <Button>. */
const TRIGGER_SM = buttonVariants({ variant: 'outline', size: 'sm' });

/** Selected / unselected on PM's own recipe — a soft-primary fill with a
    primary border and label (`Sidebar/NavLink.tsx:32`) — rather than the
    `[data-on]` token quartet (`--cs-onbg` / `--cs-onfg` / `--cs-onbd` /
    `--cs-onw`), a second active-state vocabulary driven off a global attribute
    selector PM has no analogue for. */
const ON_PILL =
  'inline-flex items-center gap-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors duration-[var(--dur-instant)] focus-ring';
const ON_PILL_ON =
  'bg-[color:var(--primary-soft)] border-[color:var(--primary-soft-border)] text-[color:var(--primary)] font-medium';
const ON_PILL_OFF = 'bg-transparent border-transparent text-fg-2 hover:bg-surface-2 hover:text-fg';
const onPill = (on, extra) => cn(ON_PILL, on ? ON_PILL_ON : ON_PILL_OFF, extra);

const RAIL_HEAD = 'text-[12px] font-medium text-fg';
const BULK_BTN =
  'h-btn-sm px-3 rounded-full border-none text-[12.5px] text-white cursor-pointer transition-colors duration-[var(--dur-instant)] focus-ring';

const splitName = (n = '') => [n.split(' ')[0] ?? '', n.split(' ').slice(1).join(' ')];

export default function Queue({ V }) {
  const views = [
    ['all-open', 'All open', V.vAll, V.cAll],
    ['unassigned', 'Unassigned', V.vUn, V.cUn],
    ['my-open', 'Mine', V.vMy, V.cMy],
    ['breaching', 'Breaching', V.vBr, V.cBr],
    ['pending', 'Pending', V.vPd, V.cPd],
    ['resolved', 'Recently closed', V.vRe, V.cRe],
    // Everything a chatbot opened, in any state. Bot-resolved conversations are
    // deliberately out of `all open` and `no one yet` — nobody should be paged
    // for work the bot finished — which made the AI's output invisible unless
    // you went hunting in `recently closed`. Seeing it and queueing it are
    // different needs.
    ['bot-handled', 'Handled by AI', V.vBot, V.cBot],
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* saved views */}
      <div className="flex-none flex items-center gap-2 px-4 pt-2.5 overflow-hidden">
        <div data-scroll className="flex gap-[3px] flex-1 min-w-0 overflow-x-auto">
          {views.map(([v, label, on, count]) => (
            <button key={v} onClick={V.onView} data-v={v} className={onPill(on, 'h-btn-sm px-3 text-[13px]')}>
              {label}
              <span className="tabular-nums opacity-75">{count}</span>
            </button>
          ))}
          <Button
            variant="outline"
            size="icon"
            onClick={V.saveView}
            aria-label="Save this filter set as a view"
            title="Save this filter set as a view"
            className="flex-none"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Button>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex-none flex flex-wrap items-center gap-2.5 px-4 py-2.5 border-b border-[color:var(--border)]">
        <Button variant="outline" size="sm" onClick={V.toggleFilters} className="hidden lg:inline-flex" leftIcon={
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        }>Filters</Button>

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
          Updated {V.refreshedRel}
        </span>

        <Button
          variant="outline"
          size="icon"
          onClick={V.refresh}
          aria-label="Refresh the list"
          title="Refresh"
          className="flex-none"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />
          </svg>
        </Button>

        <div className="w-px h-5 bg-[color:var(--border)]" />

        <Button variant="outline" size="sm" onClick={V.cycleDensity} title="Row density" className="flex-none" leftIcon={
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        }>{V.densityLabel}</Button>

        <div className="flex-none">
          <Dropdown
            align="right"
            label="Sort order"
            trigger={
              <span className={TRIGGER_SM}>
                Sort: <span className="text-fg">{V.sortLabel}</span>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        {/* Filter rail. It answers to two things now — the user's toggle and the
            viewport — which is why it stopped being a global attribute rule:
            `[data-cs-filters="off"] [data-filterrail]` could not also say
            "and never below `lg`". 1080px was CS's own number; `lg` is 1024,
            PM's. Below it the toolbar's `filters` button goes too, since it
            would toggle something that cannot appear. */}
        <aside
          data-scroll
          className={cn(
            'flex-none p-3.5 overflow-y-auto bg-surface border-r border-[color:var(--border)] flex-col gap-[18px]',
            V.filtersOn ? 'hidden lg:flex' : 'hidden',
            // was `--cs-filtw`; PM writes pane widths as classes beside the
            // markup they govern (`Sidebar.tsx:422`), not as document tokens.
            'w-[216px]',
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]">refine</span>
            <Button variant="link" size="sm" onClick={V.clearFilters} className="text-[12px]">Clear filters</Button>
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
            <span className={RAIL_HEAD}>Assignee</span>
            {V.assigneeOptions.map((o) => {
              const [first, last] = splitName(o.label.replace(/^me · /, ''));
              return (
                <button key={o.id} onClick={V.setAssigneeFilter} data-v={o.id} className={onPill(o.on, 'px-2 py-[5px] text-[12.5px] text-left')}>
                  <UserAvatar firstName={first} lastName={last} size="xs" />
                  <span className="flex-1 truncate">{o.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-[7px]">
            <span className={RAIL_HEAD}>Team</span>
            <div className="flex gap-1.5 flex-wrap">
              {V.teamOptions.map((o) => (
                <button key={o.id} onClick={V.setTeamFilter} data-v={o.id} className={onPill(o.on, 'px-3 py-[5px] text-[12.5px]')}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <span className={RAIL_HEAD}>Date range</span>
            <div className="flex gap-1.5 flex-wrap">
              {V.rangeOptions.map((o) => (
                <button key={o.id} onClick={V.setRange} data-v={o.id} className={onPill(o.on, 'px-3 py-[5px] text-[12.5px]')}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* list */}
        <section className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          {/* Header and rows now run on the shared `h-row-header` / `h-row`
              utilities (PM `design-system/page.tsx:495,508`) instead of fixed
              padding, so they scale with `--density` like every other control.
              `bg-surface-2` not the page background, semibold, and PM's
              `tracking-wider` (0.05em ≈ 0.55px) in place of `tracking-[1.4px]`,
              which was nearly 3× as wide. */}
          {/* The column header belongs to the grid, so it goes with it: a
              stacked card has no columns to label. */}
          <div
            className={cn(
              'flex-none hidden md:grid items-center gap-3 h-row-header px-3 border-b border-[color:var(--border)]',
              'bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-fg-3',
              QCOLS,
            )}
          >
            <input type="checkbox" checked={V.allSelected} onChange={V.toggleAll} aria-label="Select all conversations" className={CHECKBOX} style={CHECKBOX_STYLE} />
            <span>status</span><span className={COL_PRIO}>priority</span><span>subject</span>
            <span className={COL_CUST}>customer</span><span className={COL_AV} />
            <span className={COL_TAGS}>tags</span><span>sla</span>
            <span className="text-right">upd.</span>
          </div>

          <div data-scroll className="flex-1 overflow-y-auto">
            {V.loadingRows && V.skeletons.map((s) => (
              <div key={s.id}>
                <div className={cn('hidden md:grid items-center gap-3 px-3 h-row border-b border-[color:var(--border)]', QCOLS)}>
                  <span />
                  <Skeleton className="h-[18px] rounded-full" />
                  <Skeleton className={COL_PRIO + ' h-[18px] rounded-full'} />
                  <Skeleton className="h-3 w-[70%] rounded-full" />
                  <Skeleton className={COL_CUST + ' h-3 rounded-full'} />
                  <Skeleton className={COL_AV + ' h-6 w-6 rounded-full'} />
                  <Skeleton className={COL_TAGS + ' h-4 rounded-full'} />
                  <Skeleton className="h-4 rounded-full" />
                  <Skeleton className="h-2.5 rounded-full" />
                </div>
                <div className="md:hidden flex flex-col gap-2 px-4 py-3 border-b border-[color:var(--border)]">
                  <Skeleton className="h-[18px] w-24 rounded-full" />
                  <Skeleton className="h-3 w-[70%] rounded-full" />
                  <Skeleton className="h-3 w-[45%] rounded-full" />
                </div>
              </div>
            ))}

            {/* Both of these hand-fed a mascot through the raw `icon` prop at
                84px. `EmptyState` ships the presets PM uses — `error` is the
                state-critical chip, `no-results` is the brand blob at 280×187 —
                and CS was the only caller of the component not using them. */}
            {V.hasError && (
              <EmptyState
                illustration="error"
                title="Couldn't load the inbox"
                description="Failed to load conversations. Please try again."
                action={{ label: 'Try again', onClick: V.refresh }}
              />
            )}

            {V.isEmpty && (
              <EmptyState
                illustration="no-results"
                title="No results found"
                description="Try widening your filters."
                action={{ label: 'Clear filters', onClick: V.clearFilters }}
              />
            )}

            {/* `h-row` + `text-[13px]` replace `--cs-rowpy` / `--cs-fs`: row height
                now rides the same `--density` multiplier as every other control
                rather than a second, steeper padding ramp. A selected row gets
                PM's `--primary-soft` fill (`design-system/page.tsx:508`), which
                CS did not indicate at all. */}
            {V.rows.map((row) => {
              const [aFirst, aLast] = splitName(row.assigneeName);
              return (
                <div
                  key={row.id}
                  onClick={V.openRow}
                  onMouseEnter={V.onRowEnter}
                  onMouseLeave={V.onRowLeave}
                  data-id={row.id}
                  className={cn(
                    'relative border-b border-[color:var(--border)] text-[13px] text-fg cursor-pointer',
                    'transition-colors duration-[var(--dur-instant)]',
                    // Below `md`: PM's stacked list row (`IssuesList.tsx:142-160`) —
                    // a badge line, the subject, then a meta line.
                    'flex flex-col gap-1.5 px-4 py-3',
                    // `md` and up: the column grid, unchanged.
                    'md:grid md:items-center md:gap-3 md:h-row md:px-3 md:py-0',
                    QCOLS,
                    row.selected ? 'bg-[color:var(--primary-soft)]' : 'hover:bg-surface-2',
                  )}
                >
                  <span className={CARD_LINE}>
                    <span data-stop="1" onClick={V.stop} className="flex items-center">
                      <input type="checkbox" checked={row.selected} onChange={V.toggleSel} data-id={row.id} aria-label="Select conversation" className={CHECKBOX} style={CHECKBOX_STYLE} />
                    </span>

                    <TonePill tone={row.statusTone} dot size="md">{row.statusLabel}</TonePill>

                    <span className={COL_PRIO}>
                      <TonePill tone={row.prioTone} size="md" glyph={<span className="text-[11px]">{row.prioGlyph}</span>}>
                        {row.prioLabel}
                      </TonePill>
                    </span>
                  </span>

                  <span className="min-w-0 flex flex-col gap-0.5">
                    <span className="flex items-center gap-[7px] min-w-0">
                      {row.unread && <i className="w-1.5 h-1.5 rounded-full flex-none bg-[color:var(--primary)]" />}
                      <span title={row.channelLabel} className="text-fg-3 flex flex-none">{row.channelGlyph}</span>
                      <span className={cn('truncate', row.unread && 'font-medium')}>{row.subject}</span>
                      <span className="tabular-nums text-fg-3 text-[12px] flex-none">#{row.num}</span>
                    </span>
                    <span data-snip className="block truncate text-fg-3 text-[12.5px]">{row.snippet}</span>
                  </span>

                  <span className={CARD_LINE + ' flex-wrap gap-x-3'}>
                    <span className={COL_CUST + ' min-w-0 flex-col'}>
                      <span className="truncate">{row.custName}</span>
                      <span className="truncate text-fg-3 text-[12px]">{row.custOrg}</span>
                    </span>

                    <span className={COL_AV + ' items-center'}>
                      <UserAvatar firstName={aFirst} lastName={aLast} size="sm" />
                    </span>

                    <span className={COL_TAGS + ' gap-1 items-center min-w-0'}>
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

                    <span className="md:text-right text-fg-3 text-[12.5px] tabular-nums">{row.updated}</span>
                  </span>

                  <span
                    data-showq={String(row.hovered)}
                    data-stop="1"
                    onClick={V.stop}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 flex gap-[5px] p-1 rounded-full bg-surface border border-[color:var(--border)] shadow-card"
                    style={{ opacity: 'var(--q-op)', pointerEvents: 'var(--q-pe)' }}
                  >
                    <Button variant="ghost" size="icon" onClick={V.quickAssign} data-id={row.id} title="Assign to me" aria-label="Assign to me">
                      <AgentGlyph className="w-[15px] h-[15px]" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={V.quickStatus} data-id={row.id} title="Set pending" aria-label="Set pending">
                      <SnoozeGlyph className="w-[15px] h-[15px]" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={V.quickOpen} data-id={row.id} title="Open conversation" aria-label="Open conversation">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <Button variant="outline" size="sm" onClick={V.prevPage}>Back</Button>
              <Button variant="outline" size="sm" onClick={V.nextPage}>Next</Button>
            </div>
          </div>

          {V.hasSelection && (
            <div
              className={
                'absolute bottom-[60px] z-fixed flex items-center gap-2 pl-4 pr-2.5 py-2 shadow-modal animate-slide-up ' +
                // Seven controls in a row do not fit 375px. Below `sm` the bar
                // spans the list and its controls wrap; from `sm` up it is the
                // centred pill again. `left-1/2` has to wait for `sm` too — an
                // absolutely positioned box with only `left` set shrink-fits to
                // whatever is right of that edge, so at 375 the pill would have
                // had 187px to wrap seven controls into.
                'left-2 right-2 flex-wrap justify-center rounded-token ' +
                'sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-nowrap sm:whitespace-nowrap sm:rounded-full'
              }
              style={{ background: 'var(--plumo-night)', color: '#fff' }}
            >
              <span className="text-[13px] tabular-nums">{V.selCount} selected</span>
              <i className="w-px h-[18px] bg-white/20" />
              <button onClick={V.bulkAssign} className={BULK_BTN + ' bg-white/10 hover:bg-white/20'}>Assign to me</button>
              <button onClick={V.bulkPending} className={BULK_BTN + ' bg-white/10 hover:bg-white/20'}>Set pending</button>
              <button onClick={V.bulkTag} className={BULK_BTN + ' bg-white/10 hover:bg-white/20'}>Flag for review</button>
              {/* Was butter-on-`--plumo-on-butter`, a marketing text-on-colour
                  pairing CS invented. `warning` is the shared variant that means
                  the same thing and PM uses 14 times. */}
              <Button variant="warning" size="sm" onClick={V.bulkClose} className="rounded-full">
                Close
              </Button>
              {/* The bulk bar is a dark surface, so the ghost variant's
                  foreground/hover pair is overridden here — the geometry, the
                  press and the focus ring are the shared ones. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={V.clearSel}
                aria-label="Clear selection"
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
