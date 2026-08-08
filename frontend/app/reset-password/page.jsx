'use client';

/**
 * The page the emailed reset link lands on.
 *
 * It did not exist. `auth.resetPassword` has been in endpoints.js since the
 * beginning with no call site, and the backend built the link from APP_URL —
 * the api — so the mail sent everyone to a 404 on a host that serves no pages.
 * This is the other half of that fix; the link itself is now built from the
 * console's origin.
 *
 * Client-only, and the token is read from window.location rather than
 * useSearchParams: the console is rendered with ssr:false for the same reason
 * (state lives on the document), and useSearchParams would force this route into
 * a Suspense boundary at build time for a value we only need after mount.
 */

import React from 'react';
import { auth } from '@/lib/api/endpoints';
import { Button, Input } from '@/components/common';
import { BlobHappy } from '@/components/brand';

/* The login panel's background, verbatim — this is the same moment in the same
   product, and a different wash would read as a different site at exactly the
   point somebody is deciding whether to trust the page with a password. */

const WASH = {
  '--wash-lilac': '#A78BFA',
  backgroundImage: [
    'radial-gradient(760px 560px at 50% 46%, color-mix(in srgb, var(--surface) 30%, transparent) 0%, transparent 74%)',
    'radial-gradient(1100px 820px at 3% 2%, color-mix(in srgb, var(--primary) 15%, transparent) 0%, transparent 66%)',
    'radial-gradient(1000px 780px at 98% 3%, color-mix(in srgb, var(--wash-lilac) 24%, transparent) 0%, transparent 62%)',
    'radial-gradient(1000px 760px at 2% 98%, color-mix(in srgb, var(--cs-leafsoft) 36%, transparent) 0%, transparent 64%)',
    'radial-gradient(900px 700px at 97% 97%, color-mix(in srgb, var(--plumo-sky) 9%, transparent) 0%, transparent 62%)',
    'linear-gradient(135deg, color-mix(in srgb, var(--primary) 7%, transparent) 0%, transparent 42%, transparent 58%, color-mix(in srgb, var(--wash-lilac) 8%, transparent) 100%)',
  ].join(','),
};

const DOTS = {
  backgroundImage: 'radial-gradient(color-mix(in srgb, var(--cs-forest) 14%, transparent) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
};

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 018 0v3" />
  </svg>
);

const EyeIcon = ({ off }) =>
  off ? (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18M10.6 10.7a2.6 2.6 0 003.7 3.7M6.9 6.9C4 8.6 2 12 2 12s3.6 6.5 10 6.5c1.7 0 3.2-.4 4.5-1M14 5.7A9.6 9.6 0 0012 5.5C5.6 5.5 2 12 2 12" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );

const WarnIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none mt-px">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5M12 16h.01" />
  </svg>
);

/** The 8 here matches ResetPasswordDto's @MinLength(8) — say it before the round trip. */
const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  // 'reading' until the token is known: rendering the form and then yanking it
  // away a tick later, when there turns out to be no token, is worse than a
  // beat of nothing.
  const [phase, setPhase] = React.useState('reading');
  const [token, setToken] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [shown, setShown] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    setPhase(t ? 'form' : 'dead');
    // A password in a query string ends up in history and in any Referer the
    // page sends; the token is spent the moment we have it in memory.
    if (t) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const submit = async () => {
    if (pw.length < MIN_LENGTH) {
      setNotice(`Password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (pw !== confirm) {
      setNotice('New passwords do not match');
      return;
    }
    setNotice('');
    setPhase('saving');
    try {
      await auth.resetPassword(token, pw);
      setPhase('done');
    } catch (e) {
      // Three genuinely different answers, because they need three different
      // things from the reader:
      //   offline  — nothing is wrong with the link, press the button again;
      //   401      — the link is spent, expired, or belongs to a Plumo account,
      //              and the server's own sentence is the useful one;
      //   anything else — keep the form, keep what they typed.
      if (e?.status === 0) {
        setPhase('offline');
      } else if (e?.status === 401) {
        setNotice(e?.message || 'That link is no longer valid');
        setPhase('dead');
      } else {
        setNotice(e?.message || 'Failed to save changes. Please try again.');
        setPhase('form');
      }
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && phase === 'form') submit();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden bg-bg"
      style={WASH}
    >
      <div className="absolute inset-0 pointer-events-none opacity-[.38]" style={DOTS} />

      <div className="relative w-full max-w-[400px]">
        <div className="flex items-center justify-center gap-3 mb-[18px]">
          <img src="/assets/marks/mark-primary.svg" alt="" className="w-11 h-auto block" />
          <span className="text-[34px] font-medium leading-none tracking-[-1.4px] text-[color:var(--primary)]">
            plumo
          </span>
        </div>

        {phase === 'reading' && (
          <p className="text-[14px] text-fg-2 text-center">Loading…</p>
        )}

        {(phase === 'form' || phase === 'saving') && (
          <>
            <h1 className="text-[30px] font-semibold tracking-[-1px] text-center text-fg mb-2">
              Choose a new password.
            </h1>
            <p className="text-[14px] text-fg-2 text-center leading-relaxed mb-[26px]">
              Choose something you have not used elsewhere. Every other session signs out when you save.
            </p>

            {notice && (
              <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-token-sm mb-4 text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                <WarnIcon />
                <span>{notice}</span>
              </div>
            )}

            <div className="flex flex-col gap-3.5">
              <Input
                id="reset-password"
                type={shown ? 'text' : 'password'}
                label="New password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={onKey}
                placeholder={`At least ${MIN_LENGTH} characters`}
                autoComplete="new-password"
                leftIcon={<LockIcon />}
                className="h-[44px] !rounded-[10px] text-[14px]"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShown((s) => !s)}
                    aria-label={shown ? 'Hide password' : 'Show password'}
                    className="pointer-events-auto text-fg-3 hover:text-fg transition-colors"
                  >
                    <EyeIcon off={shown} />
                  </button>
                }
              />
              <Input
                id="reset-password-confirm"
                type={shown ? 'text' : 'password'}
                label="Confirm new password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={onKey}
                placeholder="Type it once more"
                autoComplete="new-password"
                leftIcon={<LockIcon />}
                className="h-[44px] !rounded-[10px] text-[14px]"
              />
            </div>

            <Button
              size="lg"
              onClick={submit}
              disabled={phase === 'saving'}
              className="w-full h-[44px] rounded-[10px] text-[15px] mt-5"
            >
              {phase === 'saving' ? 'Saving…' : 'Save new password'}
            </Button>

            <div className="flex justify-center mt-4">
              <a href="/" className="text-[13px] text-fg-2 hover:text-fg transition-colors">
                Back to sign in
              </a>
            </div>
          </>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3.5 text-center">
            {/* PM's mascot at PM's default size — see components/brand/Blobs.tsx. */}
            <BlobHappy />
            <h1 className="text-[26px] font-semibold tracking-[-.8px] text-fg m-0">That&apos;s done</h1>
            <p className="text-[14px] text-fg-2 leading-relaxed max-w-[34ch] m-0">
              Your new password is saved and every other session has been signed out. Sign in whenever
              you are ready.
            </p>
            <a href="/">
              <Button size="md" className="rounded-token-sm">
                Go to sign in
              </Button>
            </a>
          </div>
        )}

        {phase === 'dead' && (
          <div className="flex flex-col items-center gap-3.5 text-center">
            <h1 className="text-[26px] font-semibold tracking-[-.8px] text-fg m-0">
              This link won&apos;t work.
            </h1>
            <p className="text-[14px] text-fg-2 leading-relaxed max-w-[36ch] m-0">
              {notice || 'Reset links are good for an hour and can only be used once. This one is past that, or has already been used.'}
            </p>
            <a href="/">
              <Button size="md" className="rounded-token-sm">
                Ask for a fresh link
              </Button>
            </a>
          </div>
        )}

        {phase === 'offline' && (
          <div className="flex flex-col items-center gap-3.5 text-center">
            <h1 className="text-[26px] font-semibold tracking-[-.8px] text-fg m-0">
              Couldn&apos;t reach the server.
            </h1>
            <p className="text-[14px] text-fg-2 leading-relaxed max-w-[36ch] m-0">
              Nothing was changed and your link is still good. Please try again in a moment.
            </p>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setNotice('');
                setPhase('form');
              }}
              className="rounded-token-sm"
            >
              Try again
            </Button>
          </div>
        )}
      </div>

      <div className="absolute bottom-[22px] left-0 right-0 flex items-center justify-center gap-2.5 font-mono text-[11.5px] text-fg-3">
        <span>plumo.app</span>
        <span className="opacity-45">·</span>
        <span>v1.0.0</span>
      </div>
    </div>
  );
}
