'use client';

import { Button, Input, Segment, Switch, UserAvatar } from '../common';

/* Flat and bordered at PM's `p-4` — PM's card carries no shadow 3 times in 4,
   and `shadow-card` is kept for the things that actually float. */
const CARD = 'rounded-token bg-surface border border-[color:var(--border)] p-4 flex flex-col gap-3.5';
const CARD_TITLE = 'text-[14px] font-medium';
/** The shared notification-preference row, verbatim. */
const PREF_ROW =
  'flex items-center justify-between p-3 rounded-token-sm hover:bg-surface-2 transition-colors cursor-pointer';

export default function Account({ V }) {
  return (
    // `max-w-[720px] mx-auto` is PM's settings-page width (7 pages use it, e.g.
    // `settings/profile/page.tsx:368`); CS had 760px and never centred it. The
    // responsive padding lands on PM's `p-8` from md up, which is exactly what
    // PM's settings pane gives its pages (`settings/layout.tsx:343`).
    <div data-scroll className="flex-1 min-h-0 overflow-y-auto w-full max-w-[720px] mx-auto p-4 md:p-8 flex flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <span className="relative flex-none">
          <UserAvatar firstName={V.me.first} lastName={V.me.last} size="xl" />
          <i
            data-tone={V.me.availTone}
            className="absolute right-px bottom-px w-3 h-3 rounded-full border-[2.5px] border-[color:var(--bg)]"
            style={{ background: 'var(--tone-hue)' }}
          />
        </span>
        <div className="flex flex-col">
          <h1 className="text-[26px] font-semibold tracking-tight text-fg">{V.me.name}</h1>
          <span className="text-[13px] text-fg-2 mt-1">{V.me.role} · Tier 1 · {V.me.avail}</span>
        </div>
      </div>

      <div className={CARD}>
        <span className={CARD_TITLE}>You</span>
        <div className="flex flex-col gap-[7px]">
          <span className="text-xs font-medium text-fg">Availability</span>
          <Segment
            value={V.availOn ? 'available' : 'away'}
            onChange={V.pickAvail}
            options={[
              { value: 'available', label: 'Available' },
              { value: 'away', label: 'Away' },
            ]}
            className="self-start"
          />
          <span className="text-[12px] text-fg-3">
            Away takes you out of round-robin assignment. Nothing you already hold moves.
          </span>
        </div>
        <Input key={V.me.name} label="Display name" defaultValue={V.me.name} onBlur={V.saveName} />
      </div>

      <div className={CARD}>
        <span className={CARD_TITLE}>How it looks</span>
        <div className="flex gap-5 flex-wrap">
          <div className="flex flex-col gap-[7px]">
            <span className="text-xs font-medium text-fg">Theme</span>
            <Button variant="outline" size="sm" onClick={V.toggleTheme}>{V.themeAction}</Button>
          </div>
          <div className="flex flex-col gap-[7px]">
            <span className="text-xs font-medium text-fg">Row density</span>
            <Button variant="outline" size="sm" onClick={V.cycleDensity}>{V.densityLabel}</Button>
          </div>
        </div>
      </div>

      <div className={CARD}>
        <span className={CARD_TITLE}>Password</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <Input label="Current password" type="password" value={V.pwCur} onChange={V.onPwCur} placeholder="••••••••" />
          <Input label="New password" type="password" value={V.pwNew} onChange={V.onPwNew} placeholder="At least 8 characters" />
          <Input label="Confirm password" type="password" value={V.pwConfirm} onChange={V.onPwConfirm} placeholder="Confirm password" />
        </div>
        <Button size="md" onClick={V.savePassword} className="self-start">Save password</Button>
      </div>

      <div className={CARD.replace('gap-3.5', 'gap-3')}>
        <span className={CARD_TITLE}>Notification preferences</span>
        {[
          ['Conversations handed to me', true],
          ['SLA getting close', true],
          ['Mentions in internal notes', true],
          ['Daily summary', false],
        ].map(([label, on]) => (
          // These write the moment they move, so they are switches, not
          // checkboxes waiting on a save button this card does not have.
          <label key={label} className={PREF_ROW}>
            <span className="text-sm text-fg-2">{label}</span>
            <Switch
              defaultChecked={on}
              onChange={V.mock}
              data-msg="Notification preference updated"
              aria-label={label}
            />
          </label>
        ))}
      </div>

      <Button variant="outline" size="md" onClick={V.signOut} className="self-start">Sign out</Button>
    </div>
  );
}
