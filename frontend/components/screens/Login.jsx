'use client';

import React from 'react';
import { Button, Input } from '../common';

/* ---- background ---------------------------------------------------------
   The same wide, low-contrast mesh the project-management sign-in uses,
   hue-rotated into the support palette: brand green top-left, a cool lilac
   lift top-right, leaf mint along the bottom, white bloom through the middle. */

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

/* ---- icons -------------------------------------------------------------- */

const GoogleMark = () => (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.4z" />
    <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 010-9.4l-7.8-6.1a24 24 0 000 21.6l7.8-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.9l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6z" />
  </svg>
);

const MailIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 018 0v3" />
  </svg>
);

const ArrowIn = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12h11m-4-4l4 4-4 4M13 4H6a2 2 0 00-2 2v12a2 2 0 002 2h7" />
  </svg>
);

/** Federated provider button — quiet, bordered, full width. */
function Federated({ provider, icon, children, onClick, muted }) {
  return (
    <button
      onClick={onClick}
      data-provider={provider}
      className={[
        'w-full inline-flex items-center justify-center gap-2.5 h-[44px] px-4 rounded-[10px]',
        'border border-[color:var(--border)] bg-surface text-[14px] font-medium focus-ring',
        'transition-colors duration-[var(--dur-fast)]',
        muted ? 'text-fg-3 hover:text-fg' : 'text-fg',
        'hover:bg-surface-2 hover:border-[color:var(--primary-soft-border)]',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---- sign-in failures ----------------------------------------------------- */

/**
 * The one thing everybody who fails to sign in used to be told.
 *
 * Still the answer for a bad credential, and still the answer for an address
 * that has no account — those two must read identically or this form becomes an
 * oracle for who works here. The API agrees: auth.service returns exactly this
 * 401 for "no such user", "account deactivated" and "wrong password" alike.
 */
const BAD_CREDENTIALS = 'incorrect email or password. no harm done — try once more.';

/**
 * What a failed sign-in should actually say.
 *
 * Every failure rendered BAD_CREDENTIALS, so four different facts arrived as one
 * sentence: an agent whose desk access an admin had just switched off retyped a
 * password that was correct all along, and somebody being rate-limited was told
 * their password was wrong and kept trying — which is the one response that
 * makes a rate limit worse.
 *
 * The workspace answers are safe to be specific about, unlike the credential
 * one: they are 403s, and a 403 is only reachable once the password has already
 * been verified. There is nobody left to enumerate to by then.
 *
 * Accepts whatever the console hands over: `true` (the historical shape — no
 * detail, so the credential line), a ready-made string, or an ApiError carrying
 * `status` and the envelope's `code`. Anything it does not recognise falls back
 * to the credential line rather than inventing a diagnosis.
 */
export function loginErrorMessage(err) {
  if (!err) return null;
  if (typeof err === 'string') return err;

  // status 0 is this client's own marker for "fetch never got there".
  if (err.status === 0) return "can't reach the server right now — try again in a moment.";
  if (err.status === 429) return 'too many attempts. wait a moment, then try again.';

  // Actionable, and the reason it gets its own line: the account is real, the
  // password was right, and somebody with admin can undo this in a click.
  if (err.code === 'WORKSPACE_MEMBERSHIP_DISABLED') {
    return 'your access to this workspace has been turned off. an admin can switch it back on.';
  }

  // Every other 403 from the workspace resolver — not a member, no such desk,
  // desk suspended, or several desks and none named. The server deliberately
  // collapses those into one answer so a valid login cannot be used to map which
  // desks exist here, and this line does not try to un-collapse it.
  if (err.status === 403) return "this account can't reach this workspace. ask an admin to invite you.";

  return BAD_CREDENTIALS;
}

/* ---- screen -------------------------------------------------------------- */

export default function Login({ V }) {
  const loginError = loginErrorMessage(V.loginError);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden bg-bg"
      style={WASH}
    >
      <div className="absolute inset-0 pointer-events-none opacity-[.38]" style={DOTS} />

      <div className="relative w-full max-w-[400px]">
        {/* lockup — the green mark is what signals the support pillar */}
        <div className="flex items-center justify-center gap-3 mb-[18px]">
          <img src="/assets/marks/mark-primary.svg" alt="" className="w-11 h-auto block" />
          <span className="text-[34px] font-medium leading-none tracking-[-1.4px] text-[color:var(--primary)]">
            plumo
          </span>
        </div>

        {V.isSignin && (
          <>
            <h1 className="text-[32px] font-semibold tracking-[-1.1px] text-center text-fg mb-2">
              Welcome back.
            </h1>
            <p className="text-[14px] text-fg-2 text-center mb-[26px]">
              sign in to continue to your workspace.
            </p>

            <div className="flex flex-col gap-2.5 mb-[22px]">
              <Federated provider="google" icon={<GoogleMark />} onClick={V.federated}>
                Continue with Google
              </Federated>
              {V.pmSignInAvailable && (
                <Federated provider="plumo" icon={<ShieldIcon />} onClick={V.signInWithPm}>
                  {V.pmSignInBusy ? 'redirecting…' : 'Continue with Plumo'}
                </Federated>
              )}
              <Federated provider="sso" icon={<ShieldIcon />} onClick={V.federated} muted>
                Continue with SSO
              </Federated>
            </div>

            {V.pmSignInError && (
              <div className="mb-4 rounded-[var(--r-sm)] bg-[color:var(--danger-soft,rgba(220,60,60,.08))] px-3 py-2 text-[12.5px] text-[color:var(--danger,#c0392b)]">
                {V.pmSignInError}
              </div>
            )}

            <div className="flex items-center gap-3 mb-5">
              <span className="flex-1 h-px bg-[color:var(--border)]" />
              <span className="font-mono text-[10.5px] uppercase tracking-[1.6px] text-fg-3 whitespace-nowrap">
                or with email
              </span>
              <span className="flex-1 h-px bg-[color:var(--border)]" />
            </div>

            {loginError && (
              <div role="alert" className="flex gap-2.5 items-start px-3 py-2.5 rounded-token-sm mb-4 text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="flex-none mt-px">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4.5M12 16h.01" />
                </svg>
                <span>{loginError}</span>
              </div>
            )}

            <div className="flex flex-col gap-3.5">
              <Input
                id="login-email"
                type="email"
                label="Work email"
                required
                value={V.loginEmail}
                onChange={V.onLoginEmail}
                onKeyDown={V.onLoginKey}
                placeholder="you@work.com"
                autoComplete="email"
                leftIcon={<MailIcon />}
                className="h-[44px] !rounded-[10px] text-[14px]"
              />
              <Input
                id="login-password"
                type={V.pwType}
                label="Password"
                required
                value={V.loginPw}
                onChange={V.onLoginPw}
                onKeyDown={V.onLoginKey}
                placeholder="Enter your password"
                autoComplete="current-password"
                leftIcon={<LockIcon />}
                className="h-[44px] !rounded-[10px] text-[14px]"
                rightIcon={
                  <button
                    type="button"
                    onClick={V.togglePw}
                    aria-label={V.pwType === 'password' ? 'show password' : 'hide password'}
                    className="pointer-events-auto text-fg-3 hover:text-fg transition-colors"
                  >
                    {V.pwType === 'password' ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
                        <circle cx="12" cy="12" r="2.6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18M10.6 10.7a2.6 2.6 0 003.7 3.7M6.9 6.9C4 8.6 2 12 2 12s3.6 6.5 10 6.5c1.7 0 3.2-.4 4.5-1M14 5.7A9.6 9.6 0 0012 5.5C5.6 5.5 2 12 2 12" />
                      </svg>
                    )}
                  </button>
                }
              />
            </div>

            <div className="flex items-center justify-between gap-3 mt-4 mb-5">
              <label className="inline-flex items-center gap-2 text-[13px] text-fg cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={V.keepSignedIn}
                  onChange={V.toggleKeepSignedIn}
                  className="w-[15px] h-[15px] cursor-pointer accent-[color:var(--primary)]"
                />
                Keep me signed in
              </label>
              <Button variant="link" size="sm" onClick={V.forgot} className="text-[13px]">
                Forgot password?
              </Button>
            </div>

            <Button size="lg" onClick={V.signIn} rightIcon={<ArrowIn />} className="w-full h-[44px] rounded-[10px] text-[15px]">
              Sign in
            </Button>

            <p className="text-center text-[13px] text-fg-2 mt-[18px]">
              New to plumo?{' '}
              <Button variant="link" size="sm" onClick={V.requestAccess} className="text-[13px] align-baseline">
                Request access
              </Button>
            </p>
          </>
        )}

        {V.isReset && (
          <>
            <h1 className="text-[30px] font-semibold tracking-[-1px] text-center text-fg mb-2">
              Let&apos;s get you back in.
            </h1>
            <p className="text-[14px] text-fg-2 text-center leading-relaxed mb-[26px]">
              tell us the address you use and we&apos;ll send a link. no rush — it stays good for an hour.
            </p>
            <Input
              id="reset-email"
              type="email"
              label="Work email"
              required
              value={V.loginEmail}
              onChange={V.onLoginEmail}
              placeholder="you@work.com"
              leftIcon={<MailIcon />}
              className="h-[44px] !rounded-[10px] text-[14px] mb-4"
            />
            <Button size="lg" onClick={V.sendReset} className="w-full h-[44px] rounded-[10px] text-[15px]">
              Send me a link
            </Button>
            <div className="flex justify-center mt-4">
              <Button variant="link" size="sm" onClick={V.backToSignin} className="text-[13px]">
                back to sign in
              </Button>
            </div>
          </>
        )}

        {V.isSent && (
          <div className="flex flex-col items-center gap-3.5 text-center">
            <img
              src="/assets/mascots/mascot-07-first-response.svg"
              alt=""
              className="w-[84px] h-auto block"
              style={{ animation: 'cs-breathe 5.5s ease-in-out infinite' }}
            />
            <h1 className="text-[26px] font-semibold tracking-[-.8px] text-fg m-0">It&apos;s on its way ✿</h1>
            <p className="text-[14px] text-fg-2 leading-relaxed max-w-[34ch] m-0">
              check {V.loginEmail} whenever you&apos;re ready. if it hasn&apos;t landed in a few minutes,
              we&apos;ll happily send another.
            </p>
            <Button variant="secondary" size="md" onClick={V.sendReset} className="rounded-token-sm">
              Send it again
            </Button>
            <Button variant="link" size="sm" onClick={V.backToSignin} className="text-[13px]">
              back to sign in
            </Button>
          </div>
        )}
      </div>

      {/* footer — the status dot reflects a real /health ping */}
      <div className="absolute bottom-[22px] left-0 right-0 flex items-center justify-center gap-2.5 font-mono text-[11.5px] text-fg-3">
        <span>plumo.app</span>
        <span className="opacity-45">·</span>
        <span>v1.0.0</span>
        <span className="opacity-45">·</span>
        <span className="inline-flex items-center gap-1.5">
          all systems
          <i
            className="w-[7px] h-[7px] rounded-full inline-block"
            style={{ background: V.serviceUp ? 'var(--primary)' : 'var(--warning)' }}
          />
          {V.serviceUp ? 'operational' : 'unreachable'}
        </span>
      </div>
    </div>
  );
}
