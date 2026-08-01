'use client';

import { Button, Input, TonePill, UserAvatar } from '../common';

const RESULT_ROW =
  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-token-sm border-none bg-transparent ' +
  'text-left text-fg cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2';

const GROUP_LABEL = 'px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';

const IconButton = ({ label, onClick, children, className = '' }) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    className={
      'flex-none grid place-items-center w-8 h-8 rounded-full border border-[color:var(--border)] bg-surface ' +
      'text-fg-3 cursor-pointer transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 hover:text-fg focus-ring relative ' +
      className
    }
  >
    {children}
  </button>
);

export default function Header({ V }) {
  return (
    <header className="flex-none flex items-center gap-3.5 px-4 py-2 h-topbar relative z-fixed border-b border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--surface)_86%,transparent)] backdrop-blur-md">
      <IconButton label="collapse sidebar" onClick={V.toggleNav} className="!w-[30px] !h-[30px] !rounded-token-sm">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </IconButton>

      <div className="relative flex-1 max-w-[520px]">
        <Input
          ref={V.searchRef}
          value={V.q}
          onChange={V.onQ}
          onFocus={V.onQFocus}
          placeholder="search conversations, people…  /"
          aria-label="search conversations and people"
          className="!rounded-full h-btn-md bg-bg"
          leftIcon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
          }
        />

        {V.searchOpen && (
          <div
            data-anim="in"
            data-scroll
            className="absolute top-[calc(100%+8px)] left-0 right-0 p-2 max-h-[420px] overflow-auto z-popover rounded-token bg-surface border border-[color:var(--border)] shadow-modal animate-fade-in"
          >
            <div className={GROUP_LABEL}>conversations</div>
            {V.resTickets.map((r) => (
              <button key={r.id} onClick={V.openRow} data-id={r.id} className={RESULT_ROW}>
                <span className="tabular-nums text-fg-3 text-[12.5px]">#{r.num}</span>
                <span className="flex-1 text-[13.5px] truncate">{r.subject}</span>
                <TonePill tone={r.statusTone}>{r.statusLabel}</TonePill>
              </button>
            ))}
            {V.resNoTickets && <div className="px-2.5 py-2 text-[13px] text-fg-3">nothing matching yet ✿</div>}

            <div className={GROUP_LABEL + ' border-t border-[color:var(--border)] mt-1.5 !pt-2.5'}>customers</div>
            {V.resCustomers.map((c) => (
              <button key={c.id} onClick={V.openCustomer} data-id={c.id} className={RESULT_ROW}>
                <UserAvatar firstName={c.name?.split(' ')[0]} lastName={c.name?.split(' ').slice(1).join(' ')} size="sm" />
                <span className="flex-1 text-[13.5px]">{c.name}</span>
                <span className="text-[12.5px] text-fg-3">{c.orgName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      <Button
        onClick={V.openNewTicket}
        size="md"
        className="flex-none"
        leftIcon={
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        }
      >
        new conversation
      </Button>

      <div className="relative flex-none">
        <IconButton label="notifications" onClick={V.toggleNotif}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 01-3.4 0" />
          </svg>
          {V.hasUnreadNotif && (
            <i className="absolute top-1 right-[5px] w-[7px] h-[7px] rounded-full bg-[color:var(--warning)] border-[1.5px] border-[color:var(--surface)]" />
          )}
        </IconButton>

        {V.notifOpen && (
          <div
            data-anim="in"
            className="absolute top-[calc(100%+9px)] right-0 w-[320px] overflow-hidden z-popover rounded-token bg-surface border border-[color:var(--border)] shadow-modal animate-fade-in"
          >
            <div className="flex items-center justify-between px-3.5 py-3 border-b border-[color:var(--border)]">
              <span className="text-[13.5px] font-medium">what&apos;s new for you</span>
              <Button variant="link" size="sm" onClick={V.readAllNotif} className="text-[12.5px]">
                mark all read
              </Button>
            </div>
            {V.notifs.map((n) => (
              <div key={n.id} data-unread={n.unread} className="flex gap-2.5 items-start px-3.5 py-3 border-b border-[color:var(--border)] last:border-b-0">
                <span
                  data-tone={n.tone}
                  className="w-[26px] h-[26px] flex-none rounded-full grid place-items-center text-[12px]"
                  style={{ background: 'color-mix(in srgb, var(--tone-hue) 16%, var(--surface))', color: 'var(--tone-fg)' }}
                >
                  {n.glyph}
                </span>
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="text-[13px] leading-snug" style={{ fontWeight: 'var(--cs-subjw)' }}>{n.text}</span>
                  <span className="text-[11.5px] text-fg-3 tabular-nums">{n.rel} ago</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <IconButton label="switch light or dark theme" onClick={V.toggleTheme}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 13.5A8 8 0 1110.5 4a6.5 6.5 0 009.5 9.5z" />
        </svg>
      </IconButton>
    </header>
  );
}
