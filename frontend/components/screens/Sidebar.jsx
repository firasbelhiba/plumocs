'use client';

import { cn } from '@/lib/utils';
import { Badge, UserAvatar } from '../common';

/** Nav row — active state comes from the console's [data-on] token pair. */
const NAV_ROW =
  'w-full flex items-center gap-2.5 px-2.5 h-navitem py-[9px] rounded-token-sm text-[13.5px] text-left cursor-pointer ' +
  'border border-transparent transition-colors duration-[var(--dur-instant)] hover:bg-surface-2';

const NAV_ROW_STYLE = {
  borderLeft: '2.5px solid var(--cs-onbar)',
  background: 'var(--cs-onbg)',
  color: 'var(--cs-onfg)',
  fontWeight: 'var(--cs-onw)',
};

const SECTION = 'px-3 pt-3 pb-1.5 text-[10.5px] font-medium uppercase tracking-[1.5px] text-fg-3';

const MENU_ITEM =
  'w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-token-sm border-none bg-transparent ' +
  'text-[13px] text-fg text-left cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2';

function NavItem({ screen, icon, label, count, active, onClick }) {
  return (
    <button onClick={onClick} data-s={screen} data-on={String(active)} className={NAV_ROW} style={NAV_ROW_STYLE}>
      {icon}
      <span data-navlabel className="flex-1 whitespace-nowrap">{label}</span>
      {count != null && (
        <span data-navlabel>
          <Badge variant="default" className="tabular-nums">{count}</Badge>
        </span>
      )}
    </button>
  );
}

const NavIcon = ({ src }) => <img src={src} alt="" className="w-[18px] h-[18px] block flex-none" />;

export default function Sidebar({ V }) {
  return (
    <nav
      className="flex-none flex flex-col gap-0.5 px-2.5 py-3.5 bg-surface border-r border-[color:var(--border)] overflow-hidden transition-[width] duration-[var(--dur)] ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: 'var(--cs-navw)' }}
    >
      <div className="flex items-center gap-2.5 pl-3 pt-0.5 pb-5">
        <img src="/assets/marks/mark-primary.svg" alt="" className="w-[26px] h-auto block" />
        <span data-navlabel className="text-[16px] font-medium tracking-[-.4px] text-fg whitespace-nowrap">
          plumo
        </span>
      </div>

      <span data-navlabel className={SECTION}>overview</span>
      <NavItem screen="index" active={V.isIndex} onClick={V.go} label="all pages" icon={<NavIcon src="/assets/icons/icon-agent.svg" />} />
      <NavItem screen="queue" active={V.isQueue} onClick={V.go} label="inbox" count={V.cUn} icon={<NavIcon src="/assets/icons/icon-ticket.svg" />} />
      <NavItem screen="mine" active={V.isMine} onClick={V.go} label="mine" count={V.cMy} icon={<NavIcon src="/assets/icons/icon-resolve.svg" />} />

      <span data-navlabel className={SECTION}>people</span>
      <NavItem screen="customers" active={V.isCustomersNav} onClick={V.go} label="customers" icon={<NavIcon src="/assets/icons/icon-customer.svg" />} />
      <NavItem screen="reports" active={V.isReports} onClick={V.go} label="reports" icon={<NavIcon src="/assets/icons/icon-sla.svg" />} />
      {V.canAdmin && (
        <NavItem
          screen="settings"
          active={V.isSettings}
          onClick={V.go}
          label="settings"
          icon={
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 4.2v2M12 17.8v2M4.2 12h2M17.8 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" />
            </svg>
          }
        />
      )}
      <NavItem screen="kit" active={V.isKit} onClick={V.go} label="ui kit" icon={<NavIcon src="/assets/icons/icon-knowledge-base.svg" />} />

      <div className="mt-auto flex flex-col gap-0.5">
        <div className="h-px bg-[color:var(--border)] mx-0.5 my-2.5" />

        <div className="relative">
          <button
            onClick={V.toggleUser}
            className="w-full flex items-center gap-2.5 p-[9px] rounded-token border border-[color:var(--border)] bg-surface text-left text-fg cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 focus-ring"
          >
            <span className="relative flex-none">
              <UserAvatar firstName={V.me.first} lastName={V.me.last} size="md" />
              <i
                data-tone={V.me.availTone}
                className="absolute -right-px -bottom-px w-[9px] h-[9px] rounded-full border-2 border-[color:var(--surface)]"
                style={{ background: 'var(--tone-hue)' }}
              />
            </span>
            <span data-navlabel className="flex-1 min-w-0">
              <span className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium truncate">{V.me.name}</span>
                <span className="text-[11.5px] text-fg-3">{V.me.role} · {V.me.avail}</span>
              </span>
            </span>
          </button>

          {V.userOpen && (
            <div
              data-anim="in"
              className="absolute bottom-[calc(100%+8px)] left-0 w-[246px] p-1.5 z-popover rounded-token bg-surface border border-[color:var(--border)] shadow-modal animate-fade-in"
            >
              <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]">
                viewing as
              </div>
              <div className="flex gap-1 px-1.5 pb-2">
                {[
                  ['agent', V.roleAgent],
                  ['lead', V.roleLead],
                  ['admin', V.roleAdmin],
                ].map(([role, on]) => (
                  <button
                    key={role}
                    onClick={V.setRole}
                    data-r={role}
                    data-on={String(on)}
                    className="flex-1 py-[7px] rounded-full text-[12px] cursor-pointer transition-colors duration-[var(--dur-instant)] focus-ring"
                    style={{
                      border: '1px solid var(--cs-onbd)',
                      background: 'var(--cs-onbg)',
                      color: 'var(--cs-onfg)',
                      fontWeight: 'var(--cs-onw)',
                    }}
                  >
                    {role}
                  </button>
                ))}
              </div>

              <button onClick={V.toggleAvail} className={MENU_ITEM}>
                <i data-tone={V.me.availTone} className="w-2 h-2 rounded-full flex-none" style={{ background: 'var(--tone-hue)' }} />
                <span className="flex-1">{V.me.availAction}</span>
              </button>
              <button onClick={V.openAccount} className={MENU_ITEM}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-fg-3">
                  <path d="M19 20v-1.6a3.4 3.4 0 00-3.4-3.4H8.4A3.4 3.4 0 005 18.4V20" />
                  <circle cx="12" cy="8" r="3.4" />
                </svg>
                <span className="flex-1">your account</span>
              </button>
              <button onClick={V.toggleTheme} className={MENU_ITEM}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-fg-3">
                  <path d="M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z" />
                </svg>
                <span className="flex-1">{V.themeAction}</span>
              </button>
              <button onClick={V.openSheet} className={MENU_ITEM}>
                <span className="w-[15px] text-center text-fg-3">?</span>
                <span className="flex-1">keyboard shortcuts</span>
              </button>
              <div className="h-px bg-[color:var(--border)] mx-2 my-1.5" />
              <button onClick={V.signOut} className={MENU_ITEM}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-fg-3">
                  <path d="M15 12H4m3-4l-3 4 3 4M13 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" />
                </svg>
                <span className="flex-1">sign out</span>
              </button>
            </div>
          )}
        </div>

        <button
          onClick={V.mock}
          data-msg="nothing new since tuesday — enjoy the quiet ✿"
          className={cn(MENU_ITEM, 'text-fg-3 hover:text-fg')}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
            <path d="M7 4h7l4 4v12a1.8 1.8 0 01-1.8 1.8H7A1.8 1.8 0 015.2 20V5.8A1.8 1.8 0 017 4z" />
            <path d="M13.5 4v4.5H18" />
          </svg>
          <span data-navlabel className="flex-1 whitespace-nowrap">what&apos;s new</span>
        </button>
      </div>
    </nav>
  );
}
