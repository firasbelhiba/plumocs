'use client';

import { Button, Input, Segment, Switch, UserAvatar } from '../common';

const CARD = 'rounded-token bg-surface border border-[color:var(--border)] shadow-card p-5 flex flex-col gap-3.5';
const CARD_TITLE = 'text-[14px] font-medium';
/** The shared notification-preference row, verbatim. */
const PREF_ROW =
  'flex items-center justify-between p-3 rounded-token-sm hover:bg-surface-2 transition-colors cursor-pointer';

export default function Account({ V }) {
  return (
    <div data-scroll className="flex-1 min-h-0 overflow-y-auto px-6 py-[22px] flex flex-col gap-4 max-w-[760px]">
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
          <span className="text-[13px] text-fg-2 mt-1">{V.me.role} · tier 1 · {V.me.avail}</span>
        </div>
      </div>

      <div className={CARD}>
        <span className={CARD_TITLE}>you</span>
        <div className="flex flex-col gap-[7px]">
          <span className="text-xs font-medium text-fg">availability</span>
          <Segment
            value={V.availOn ? 'available' : 'away'}
            onChange={V.pickAvail}
            options={[
              { value: 'available', label: 'available' },
              { value: 'away', label: 'away' },
            ]}
            className="self-start"
          />
          <span className="text-[12px] text-fg-3">
            away takes you out of round-robin assignment. nothing you already hold moves.
          </span>
        </div>
        <Input key={V.me.name} label="display name" defaultValue={V.me.name} onBlur={V.saveName} />
      </div>

      <div className={CARD}>
        <span className={CARD_TITLE}>how it looks</span>
        <div className="flex gap-5 flex-wrap">
          <div className="flex flex-col gap-[7px]">
            <span className="text-xs font-medium text-fg">theme</span>
            <Button variant="outline" size="sm" onClick={V.toggleTheme}>{V.themeAction}</Button>
          </div>
          <div className="flex flex-col gap-[7px]">
            <span className="text-xs font-medium text-fg">row density</span>
            <Button variant="outline" size="sm" onClick={V.cycleDensity}>{V.densityLabel}</Button>
          </div>
        </div>
      </div>

      <div className={CARD}>
        <span className={CARD_TITLE}>password</span>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <Input label="current" type="password" value={V.pwCur} onChange={V.onPwCur} placeholder="••••••••" />
          <Input label="new" type="password" value={V.pwNew} onChange={V.onPwNew} placeholder="something you'll remember" />
          <Input label="once more" type="password" value={V.pwConfirm} onChange={V.onPwConfirm} placeholder="just to be sure" />
        </div>
        <Button size="md" onClick={V.savePassword} className="self-start">save password</Button>
      </div>

      <div className={CARD.replace('gap-3.5', 'gap-3')}>
        <span className={CARD_TITLE}>what we tell you about</span>
        {[
          ['conversations handed to me', true],
          ['sla getting close', true],
          ['mentions in internal notes', true],
          ['a quiet summary at the end of the day', false],
        ].map(([label, on]) => (
          // These write the moment they move, so they are switches, not
          // checkboxes waiting on a save button this card does not have.
          <label key={label} className={PREF_ROW}>
            <span className="text-sm text-fg-2">{label}</span>
            <Switch
              defaultChecked={on}
              onChange={V.mock}
              data-msg="preference saved"
              aria-label={label}
            />
          </label>
        ))}
      </div>

      <Button variant="outline" size="md" onClick={V.signOut} className="self-start">sign out</Button>
    </div>
  );
}
