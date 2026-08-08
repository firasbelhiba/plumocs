'use client';

import { cn } from '@/lib/utils';
import { Badge, Dropdown, DropdownItem, Icon, UserAvatar } from '../common';
import { CustomerGlyph, ResolveGlyph, SlaGlyph, TicketGlyph } from './glyphs';

/** Nav row — PM's `NavLink.tsx:29-44`, geometry and state classes both.
    38px tall, 14px medium, `px-3`/`gap-3`, `rounded-token`, and the active pair
    is `--primary-soft` on `--primary` rather than the `[data-on]` token trio the
    rest of the console still uses. `focus-ring` is CS's addition (item 15); PM's
    row is an `<a>` and leans on the browser default. */
const NAV_ROW =
  'group relative w-full flex items-center gap-3 h-[38px] px-3 rounded-token text-[14px] font-medium ' +
  'text-left cursor-pointer transition-colors focus-ring';

const MENU_ITEM =
  'w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-token-sm border-none bg-transparent ' +
  'text-[13px] text-fg text-left cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-ring';

function NavItem({ screen, icon, label, count, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      data-s={screen}
      title={collapsed ? label : undefined}
      className={cn(
        NAV_ROW,
        active
          ? 'bg-[color:var(--primary-soft)] text-[color:var(--primary)]'
          : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
      )}
    >
      {/* Active accent bar — a detached pill, not a border on the row, so it does
          not eat 2.5px of the row's own box. PM suppresses it when the sidebar
          is collapsed (NavLink.tsx:38), and — like the label and the count —
          takes that from an `isCollapsed` prop rather than a global selector,
          which is what lets the drawer render expanded while the desktop rail
          beside it stays collapsed. */}
      {active && !collapsed && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full"
          style={{ background: 'var(--primary)' }}
        />
      )}
      <span className={cn('relative shrink-0', active ? 'text-[color:var(--primary)]' : 'text-fg-3 group-hover:text-fg-2')}>
        {icon}
      </span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && count != null && (
        <Badge variant="default" className="tabular-nums">{count}</Badge>
      )}
    </button>
  );
}

/**
 * `isMobile` is PM's own prop (`Sidebar/Sidebar.tsx:112`): inside the overlay
 * drawer the rail is full-width, carries its own header with a close button,
 * and — `isCollapsed = isMobile ? false : collapsed` at `:381` — ignores the
 * desktop collapse entirely.
 */
export default function Sidebar({ V, isMobile = false }) {
  const collapsed = !isMobile && !V.navOn;
  return (
    <nav
      className={cn(
        'flex-none flex flex-col bg-surface border-r border-[color:var(--border)] overflow-hidden',
        'transition-[width] duration-[var(--dur)] ease-[cubic-bezier(0.2,0,0,1)]',
        // Both widths are classes, the way PM writes them (`Sidebar.tsx:422`:
        // `isCollapsed ? 'w-12' : 'w-[240px]'`). CS said the same thing through
        // `--cs-navw` on the element plus a `[data-cs-nav="off"]` rule on
        // <html>, so the width lived two files away from what it sized.
        collapsed ? 'w-16' : 'w-[236px]',
        isMobile && 'w-full h-full',
      )}
    >
      {/* PM `Sidebar/Sidebar.tsx:429-443` */}
      {isMobile && (
        <div className="flex items-center justify-between p-3 border-b border-[color:var(--border)]">
          <span className="text-sm font-semibold text-fg">Menu</span>
          <button
            onClick={V.closeMobileNav}
            className="p-1.5 rounded-token-sm hover:bg-surface-2 transition-colors focus-ring"
            aria-label="Close menu"
          >
            <Icon name="state-close" size={16} className="text-fg-2" />
          </button>
        </div>
      )}

      {/* PM's rail is a flat, unlabelled list (`Sidebar/Sidebar.tsx:446,461`):
          a scrolling `py-2` region wrapping a `px-2 space-y-0.5` stack. The
          "overview" / "people" section headings CS used to split these five rows
          under are gone with it — PM carries exactly one section label in the
          whole rail, and it belongs to a list CS does not have. */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-hidden">
        <div className="px-2 space-y-0.5">
          <NavItem screen="queue" active={V.isQueue} collapsed={collapsed} onClick={V.go} label="Inbox" count={V.cUn} icon={<TicketGlyph />} />
          <NavItem screen="mine" active={V.isMine} collapsed={collapsed} onClick={V.go} label="Mine" count={V.cMy} icon={<ResolveGlyph />} />
          <NavItem screen="customers" active={V.isCustomersNav} collapsed={collapsed} onClick={V.go} label="Customers" icon={<CustomerGlyph />} />
          <NavItem screen="reports" active={V.isReports} collapsed={collapsed} onClick={V.go} label="Reports" icon={<SlaGlyph />} />
          {V.canAdmin && (
            <NavItem
              screen="settings"
              active={V.isSettings}
              collapsed={collapsed}
              onClick={V.go}
              label="Settings"
              icon={
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M12 4.2v2M12 17.8v2M4.2 12h2M17.8 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" />
                </svg>
              }
            />
          )}
        </div>
      </div>

      <div className="flex-none flex flex-col gap-0.5 px-2 pb-2">
        <div className="h-px bg-[color:var(--border)] mx-0.5 mb-2" />

        {/* The user card sits at the foot of the rail, so this is the one menu
            that has to open upward — `bottom-full mb-2` in place of the
            primitive's `mt-2`. Everything else is `Dropdown`'s. */}
        <div className="[&_[role=menu]]:bottom-full [&_[role=menu]]:mb-2 [&_[role=menu]]:mt-0 [&>div>button]:w-full">
          <Dropdown
            align="left"
            label="Your account"
            trigger={
              <span className="w-full flex items-center gap-2.5 p-[9px] rounded-token border border-[color:var(--border)] bg-surface text-left text-fg transition-colors duration-[var(--dur-instant)] hover:bg-surface-2">
                <span className="relative flex-none">
                  <UserAvatar firstName={V.me.first} lastName={V.me.last} size="md" />
                  <i
                    data-tone={V.me.availTone}
                    className="absolute -right-px -bottom-px w-[9px] h-[9px] rounded-full border-2 border-[color:var(--surface)]"
                    style={{ background: 'var(--tone-hue)' }}
                  />
                </span>
                {!collapsed && (
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13px] font-medium truncate">{V.me.name}</span>
                      <span className="text-[11.5px] text-fg-3">{V.me.role} · {V.me.avail}</span>
                    </span>
                  </span>
                )}
              </span>
            }
          >
            <DropdownItem onClick={V.toggleAvail}>
              <span className={MENU_ITEM}>
                <i data-tone={V.me.availTone} className="w-2 h-2 rounded-full flex-none" style={{ background: 'var(--tone-hue)' }} />
                <span className="flex-1">{V.me.availAction}</span>
              </span>
            </DropdownItem>
            <DropdownItem onClick={V.openAccount}>
              <span className={MENU_ITEM}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-fg-3">
                  <path d="M19 20v-1.6a3.4 3.4 0 00-3.4-3.4H8.4A3.4 3.4 0 005 18.4V20" />
                  <circle cx="12" cy="8" r="3.4" />
                </svg>
                <span className="flex-1">Your Account</span>
              </span>
            </DropdownItem>
            <DropdownItem onClick={V.toggleTheme}>
              <span className={MENU_ITEM}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-fg-3">
                  <path d="M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z" />
                </svg>
                <span className="flex-1">{V.themeAction}</span>
              </span>
            </DropdownItem>
            <DropdownItem onClick={V.openSheet}>
              <span className={MENU_ITEM}>
                <span className="w-[15px] text-center text-fg-3">?</span>
                <span className="flex-1">Keyboard Shortcuts</span>
              </span>
            </DropdownItem>
            <div className="h-px bg-[color:var(--border)] my-1" />
            <DropdownItem onClick={V.signOut}>
              <span className={MENU_ITEM}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-fg-3">
                  <path d="M15 12H4m3-4l-3 4 3 4M13 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" />
                </svg>
                <span className="flex-1">Sign Out</span>
              </span>
            </DropdownItem>
          </Dropdown>
        </div>

      </div>
    </nav>
  );
}
