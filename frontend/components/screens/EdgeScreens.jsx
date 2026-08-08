'use client';

import { Button } from '../common';

const CENTRED = 'flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-10 text-center';
const EYEBROW = 'text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';

export function NotFound({ V }) {
  return (
    <div
      className={CENTRED}
      style={{ background: 'radial-gradient(760px 420px at 50% 12%, var(--primary-soft) 0%, transparent 62%)' }}
    >
      <img src="/assets/mascots/mascot-05-waiting.svg" alt="" className="w-24 h-auto block" />
      <span className={EYEBROW}>404</span>
      <h2 className="text-[24px] font-medium tracking-[-.7px]">we can&apos;t find that one</h2>
      <p className="text-[14px] text-fg-2 max-w-[40ch] leading-relaxed">
        the link may be old, or the conversation may have been merged into another. nothing is lost — it&apos;s
        just not here.
      </p>
      <div className="flex gap-2 mt-1">
        <Button onClick={V.go} data-s="queue" size="md">back to the inbox</Button>
        <Button onClick={V.focusSearch} variant="outline" size="md">search for it instead</Button>
      </div>
    </div>
  );
}

export function Oops({ V }) {
  return (
    <div
      className={CENTRED}
      style={{ background: 'radial-gradient(760px 420px at 50% 12%, var(--warning-soft) 0%, transparent 62%)' }}
    >
      <img src="/assets/mascots/mascot-03-empathetic.svg" alt="" className="w-24 h-auto block" />
      <span className={EYEBROW}>something&apos;s off</span>
      <h2 className="text-[24px] font-medium tracking-[-.7px]">that didn&apos;t work, and it&apos;s on us</h2>
      <p className="text-[14px] text-fg-2 max-w-[42ch] leading-relaxed">
        your work is safe — nothing you wrote has gone anywhere. we&apos;ll try again in a moment, or you can
        nudge it yourself.
      </p>
      <div className="flex gap-2 mt-1">
        <Button onClick={V.go} data-s="queue" size="md">try again</Button>
        <Button onClick={V.mock} data-msg="we've told the team — thank you ✿" variant="outline" size="md">
          tell the team
        </Button>
      </div>
      <span className="font-mono text-[11.5px] text-fg-3 mt-1.5">reference 7f21-c4</span>
    </div>
  );
}
