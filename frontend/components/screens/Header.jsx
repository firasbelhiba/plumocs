'use client';

import { cn } from '@/lib/utils';
import { Button, Input, TonePill, UserAvatar } from '../common';

const RESULT_ROW =
  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-token-sm border-none bg-transparent ' +
  'text-left text-fg cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-ring';

const GROUP_LABEL = 'px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';

/* Neither panel below is a menu of items, so neither becomes a `Dropdown`:
   one is a search result list with its own input, the other has a header and
   its own "mark all read" action. What they do take from the primitive is its
   chrome — `mt-2` (8px, not 8 and 9), `z-dropdown` rather than `z-popover`,
   `shadow-card` rather than `shadow-modal`, and `animate-dropdown` in place of
   the retired `data-anim="in"` overshoot. Same recipe as `Ticket.jsx`'s two
   hand-rolled panels. */
const PANEL =
  'absolute top-full mt-2 z-dropdown rounded-token bg-surface border border-[color:var(--border)] shadow-card animate-dropdown';

/** The shared icon button, with `relative` so the unread pip can hang off it.
    PM's top-bar icon buttons are chromeless — `p-1 rounded text-fg-2
    hover:bg-surface-2` (`Header.tsx:277-287`), no border and no surface fill —
    so this is `ghost`, whose colour pair is that string exactly. The box stays
    the primitive's `size="icon"`; the outlined circle it used to draw is the
    thing item 32 removes. */
const IconButton = ({ label, onClick, children, className = '' }) => (
  <Button
    variant="ghost"
    size="icon"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={'flex-none relative ' + className}
  >
    {children}
  </Button>
);

/** The search field, shared by the desktop slot and the mobile drop-down row so
    the two can never drift. Only the desktop copy takes `V.searchRef`: both are
    in the DOM at once whenever the mobile row is open, and the `/` shortcut has
    to land on the one that is actually visible. */
const Search = ({ V, autoFocus, withRef }) => (
  <Input
    ref={withRef ? V.searchRef : undefined}
    value={V.q}
    onChange={V.onQ}
    onFocus={V.onQFocus}
    autoFocus={autoFocus}
    placeholder="Search conversations, people…  /"
    aria-label="Search conversations and people"
    className="!rounded-full h-btn-md bg-bg"
    leftIcon={
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" />
      </svg>
    }
  />
);

const SearchGlyph = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

/** The results popover, likewise shared: `inset` is the only thing that differs
    between the desktop slot (flush) and the mobile row (inside its padding). */
const Results = ({ V, inset }) => (
  <div role="listbox" data-scroll className={PANEL + ' ' + inset + ' p-2 max-h-[420px] overflow-auto'}>
    <div className={GROUP_LABEL}>conversations</div>
    {V.resTickets.map((r) => (
      <button key={r.id} onClick={V.openRow} data-id={r.id} className={RESULT_ROW}>
        <span className="tabular-nums text-fg-3 text-[12.5px]">#{r.num}</span>
        <span className="flex-1 text-[13.5px] truncate">{r.subject}</span>
        <TonePill tone={r.statusTone}>{r.statusLabel}</TonePill>
      </button>
    ))}
    {V.resNoTickets && <div className="px-2.5 py-2 text-[13px] text-fg-3">No results found</div>}

    <div className={GROUP_LABEL + ' border-t border-[color:var(--border)] mt-1.5 !pt-2.5'}>customers</div>
    {V.resCustomers.map((c) => (
      <button key={c.id} onClick={V.openCustomer} data-id={c.id} className={RESULT_ROW}>
        <UserAvatar firstName={c.name?.split(' ')[0]} lastName={c.name?.split(' ').slice(1).join(' ')} size="sm" />
        <span className="flex-1 text-[13.5px]">{c.name}</span>
        <span className="text-[12.5px] text-fg-3">{c.orgName}</span>
      </button>
    ))}
  </div>
);

export default function Header({ V }) {
  return (
    // PM's header is a bordered box wrapping a fixed-height bar
    // (`Header.tsx:126-130`), not a bar itself — which is what leaves room for
    // the mobile search row to drop below it without changing the bar's height.
    <header className="flex-none relative z-sticky border-b border-[color:var(--border)] bg-surface">
      <div className="flex items-center gap-2 md:gap-3.5 h-12 md:h-14 px-2 md:px-3">
      {/* Hamburger + logo, PM's left group (`Header.tsx:133, 176-184`). The mark
          and wordmark used to live at the top of the left rail; the shell puts
          them here, at 24px with a 14px wordmark. The artwork itself is the one
          exempt asset — its place in the shell is not.

          The hamburger is `md:hidden` and opens the drawer, exactly as PM's
          does. It used to be CS's desktop collapse toggle at every width; that
          job moved to PM's collapse handle on the rail's edge
          (`DashboardLayout.tsx:82-105`), so no width loses a control. */}
      <div className="flex items-center gap-2 md:gap-3 flex-none">
        <IconButton label="Open menu" onClick={V.openMobileNav} className="md:hidden">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </IconButton>

        <span className="flex items-center gap-2 ml-1 md:ml-8">
          <img src="/assets/marks/mark-primary.svg" alt="" className="w-6 h-auto block" />
          <span className="text-[14px] font-medium tracking-tight text-fg whitespace-nowrap">plumo</span>
        </span>
      </div>

      <div className="relative hidden md:block flex-1 max-w-[520px]">
        <Search V={V} withRef />
        {V.searchOpen && <Results V={V} inset="left-0 right-0" />}
      </div>

      <div className="flex-1" />

      {/* Search collapses to an icon below `md` (PM `Header.tsx:222-247`). PM's
          opens a command palette; CS has no palette — that is Open Question E
          and item 32 left it alone — so this drops the same field into a row
          under the bar rather than inventing a second search mechanism. */}
      <IconButton label="Search" onClick={V.toggleMobileSearch} className="md:hidden">
        <SearchGlyph />
      </IconButton>

      <Button
        onClick={V.openNewTicket}
        size="sm"
        aria-label="New conversation"
        className="flex-none"
        leftIcon={
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        }
      >
        {/* PM `Header.tsx:258` — the label goes, the glyph stays. */}
        <span className="hidden md:inline">New Conversation</span>
      </Button>

      <div className="relative flex-none">
        <IconButton label="Notifications" onClick={V.toggleNotif}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 01-3.4 0" />
          </svg>
          {V.hasUnreadNotif && (
            <i className="absolute top-1 right-[5px] w-[7px] h-[7px] rounded-full bg-[color:var(--warning)] border-[1.5px] border-[color:var(--surface)]" />
          )}
        </IconButton>

        {V.notifOpen && (
          <div className={PANEL + ' right-0 w-[320px] overflow-hidden'}>
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-[color:var(--border)]">
              <span className="text-[13.5px] font-medium">Notifications</span>
              <Button variant="link" size="sm" onClick={V.readAllNotif} className="text-[12.5px]">
                Mark all as read
              </Button>
            </div>
            {V.notifs.map((n) => (
              <div key={n.id} className="flex gap-2.5 items-start px-3.5 py-3 border-b border-[color:var(--border)] last:border-b-0">
                <span
                  data-tone={n.tone}
                  className="w-[26px] h-[26px] flex-none rounded-full grid place-items-center text-[12px]"
                  style={{ background: 'color-mix(in srgb, var(--tone-hue) 16%, var(--surface))', color: 'var(--tone-fg)' }}
                >
                  {n.glyph}
                </span>
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className={cn('text-[13px] leading-snug', n.unread && 'font-medium')}>{n.text}</span>
                  <span className="text-[11.5px] text-fg-3 tabular-nums">{n.rel} ago</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <IconButton label="Switch light or dark theme" onClick={V.toggleTheme}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z" />
        </svg>
      </IconButton>
      </div>

      {V.mobileSearchOpen && (
        <div className="md:hidden relative px-2 pb-2">
          <Search V={V} autoFocus />
          {V.searchOpen && <Results V={V} inset="left-2 right-2" />}
        </div>
      )}
    </header>
  );
}
