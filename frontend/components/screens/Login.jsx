'use client';

import React from 'react';
import { Button, CHECKBOX, CHECKBOX_STYLE, CHECK_LABEL, Input } from '../common';
import { BlobHappy } from '../brand';

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
    'radial-gradient(1000px 760px at 2% 98%, color-mix(in srgb, var(--primary-soft-border) 36%, transparent) 0%, transparent 64%)',
    'radial-gradient(900px 700px at 97% 97%, color-mix(in srgb, var(--plumo-sky) 9%, transparent) 0%, transparent 62%)',
    'linear-gradient(135deg, color-mix(in srgb, var(--primary) 7%, transparent) 0%, transparent 42%, transparent 58%, color-mix(in srgb, var(--wash-lilac) 8%, transparent) 100%)',
  ].join(','),
};

/* The dot grid PM lays over that wash (`.login-bg::before`). Three things make
   it read the way it does on PM and none of them are optional:

   - the dots are drawn at full strength, not dimmed. PM's tint is 12% of the
     brand colour and nothing multiplies it; the 14%-at-38%-opacity this used to
     be worked out to ~5%, which is why the texture was invisible next to PM's.
   - `circle`, not the default ellipse, so a dot stays a dot.
   - the mask, which is the whole character of it: dots are erased through the
     middle of the card and ramp to full towards the corners. Without it the
     grid sits flat behind the form instead of framing it. */
const DOT_MASK = 'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, black 80%)';

const DOTS = {
  backgroundImage: 'radial-gradient(circle, var(--login-dot) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
  maskImage: DOT_MASK,
  WebkitMaskImage: DOT_MASK,
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

/**
 * The Plumo blob, for the "Continue with Plumo" button.
 *
 * In CS green, not PM blue. The Google-button argument — a federated button
 * wears the provider's colours — is real, and it loses here: rendered, a blue
 * blob was the only non-green thing on the page and took the eye before the
 * primary action did. Google gets away with it because everyone already reads
 * that mark as a logo; an unfamiliar blob just reads as the odd one out.
 *
 * 17px to sit on Google's optical size rather than the 15px of the outline
 * icons next to it: a filled shape reads larger than a stroked one at the same
 * box, and matching the number would make this look bigger than the G.
 */
const PlumoMark = () => (
  <svg width="17" height="17" viewBox="0 0 80 80" aria-hidden="true">
    <path
      d="M 40 4 C 60 2, 75 18, 73 38 C 81 48, 73 65, 56 66 C 51 76, 32 76, 23 68 C 5 71, -2 52, 8 40 C 0 22, 20 4, 40 4 Z"
      fill="var(--primary)"
    />
    <path d="M 22 34 Q 28 27, 34 34" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M 46 34 Q 52 27, 58 34" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6z" />
  </svg>
);

const MailIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 018 0v3" />
  </svg>
);

/**
 * PM's `auth-sign-in`, path for path — bracket on the RIGHT, arrow running into
 * it. What stood here before was the other glyph in PM's registry: bracket on
 * the left, arrow leaving through the opening, which is `auth-sign-out`. A
 * sign-in button was wearing the sign-out icon; the component name was the only
 * part of it that said "in".
 */
const ArrowIn = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M 13 4 L 19 4 Q 20 4 20 5 L 20 19 Q 20 20 19 20 L 13 20" />
    <path d="M 4 12 L 14 12 M 10 8 L 14 12 L 10 16" />
  </svg>
);

/** Federated provider button — the shared outline button, full width. */
function Federated({ provider, icon, children, onClick, muted }) {
  return (
    <Button
      variant="outline"
      size="md"
      onClick={onClick}
      data-provider={provider}
      leftIcon={icon}
      className={'w-full justify-center' + (muted ? ' text-fg-3 hover:text-fg' : '')}
    >
      {children}
    </Button>
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
const BAD_CREDENTIALS = 'Incorrect email or password. Please try again.';

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
  if (err.status === 0) return 'Network error. Please check your connection.';
  if (err.status === 429) return 'Too many attempts. Please wait a moment and try again.';

  // Actionable, and the reason it gets its own line: the account is real, the
  // password was right, and somebody with admin can undo this in a click.
  if (err.code === 'WORKSPACE_MEMBERSHIP_DISABLED') {
    return 'Your access to this workspace has been turned off. An admin can switch it back on.';
  }

  // Every other 403 from the workspace resolver — not a member, no such desk,
  // desk suspended, or several desks and none named. The server deliberately
  // collapses those into one answer so a valid login cannot be used to map which
  // desks exist here, and this line does not try to un-collapse it.
  if (err.status === 403) return "This account can't reach this workspace. Ask an admin to invite you.";

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
      <div className="absolute inset-0 pointer-events-none" style={DOTS} />

      <div className="relative w-full max-w-[400px]">
        {/* Lockup — the green mark is what signals the support pillar, but the
            size is PM's. PM renders one 360x100 lockup SVG at height 56, so
            everything inside it lands at 0.56 scale: blob 40.7x39.2, wordmark
            56 * 0.56 = 31.36px, ~10.5px between them. CS composes the same
            lockup from two elements, so each number is set to the figure PM's
            scale produces — the mark's viewBox is 88 wide, and 88 * 0.56 = 49px
            of image width puts its blob on PM's. */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <img src="/assets/marks/mark-primary.svg" alt="" className="w-[49px] h-auto block" />
          <span className="text-[31.36px] font-medium leading-none tracking-[-1.4px] text-[color:var(--primary)]">
            plumo
          </span>
        </div>

        {V.isSignin && (
          <>
            {/* `leading-tight` is not cosmetic here. CS's body sets
                line-height 1.65, so an unqualified 32px heading claimed a 52.8px
                line box against PM's 28px * 1.25 = 35px — nearly 18px of the
                slack between the mark and the subtitle came from this one line.
                Same reason the subtitle is pinned to `leading-normal` (1.5),
                which is what PM inherits from Tailwind's preflight. */}
            <h1 className="text-[28px] font-semibold tracking-tight leading-tight text-center text-fg">
              Welcome back.
            </h1>
            <p className="text-[13px] leading-normal text-fg-2 text-center mt-1.5">
              sign in to continue to your workspace.
            </p>

            <div className="flex flex-col gap-2 mt-5">
              <Federated provider="google" icon={<GoogleMark />} onClick={V.federated}>
                Continue with Google
              </Federated>
              {V.pmSignInAvailable && (
                <Federated provider="plumo" icon={<PlumoMark />} onClick={V.signInWithPm}>
                  {V.pmSignInBusy ? 'Redirecting…' : 'Continue with Plumo'}
                </Federated>
              )}
              <Federated provider="sso" icon={<ShieldIcon />} onClick={V.federated} muted>
                Continue with SSO
              </Federated>
            </div>

            {V.pmSignInError && (
              <div className="mt-3 rounded-token bg-[color:var(--danger-soft,rgba(220,60,60,.08))] px-3 py-2 text-[12.5px] text-[color:var(--danger,#c0392b)]">
                {V.pmSignInError}
              </div>
            )}

            <div className="flex items-center gap-3 my-4">
              <span className="flex-1 h-px bg-[color:var(--border)]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.55px] text-fg-3 whitespace-nowrap">
                or with email
              </span>
              <span className="flex-1 h-px bg-[color:var(--border)]" />
            </div>

            {loginError && (
              <div role="alert" className="flex gap-2.5 items-start px-3 py-2.5 rounded-token-sm mb-3 text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none mt-px">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4.5M12 16h.01" />
                </svg>
                <span>{loginError}</span>
              </div>
            )}

            <div className="flex flex-col gap-3">
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
                rightIcon={
                  <button
                    type="button"
                    onClick={V.togglePw}
                    aria-label={V.pwType === 'password' ? 'Show password' : 'Hide password'}
                    className="pointer-events-auto text-fg-3 hover:text-fg transition-colors"
                  >
                    {V.pwType === 'password' ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
                        <circle cx="12" cy="12" r="2.6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18M10.6 10.7a2.6 2.6 0 003.7 3.7M6.9 6.9C4 8.6 2 12 2 12s3.6 6.5 10 6.5c1.7 0 3.2-.4 4.5-1M14 5.7A9.6 9.6 0 0012 5.5C5.6 5.5 2 12 2 12" />
                      </svg>
                    )}
                  </button>
                }
              />
            </div>

            {/* 12 / 4 / 12, measured off PM rather than read off it. PM's row
                sits in a `space-y-3` form, and that selector outranks the
                `mt-2` PM puts on its own submit button — so the gap under this
                row is 12px there, not the 20 the class names suggest. Hence no
                `mt-2` on the button below. */}
            <div className="flex items-center justify-between gap-3 mt-3 pt-1 mb-3">
              <label className={CHECK_LABEL}>
                <input
                  type="checkbox"
                  checked={V.keepSignedIn}
                  onChange={V.toggleKeepSignedIn}
                  className={CHECKBOX}
                  style={CHECKBOX_STYLE}
                />
                Keep me signed in
              </label>
              <button type="button" onClick={V.forgot} className="bg-transparent border-0 p-0 text-[13px] font-medium text-[color:var(--primary)] hover:underline cursor-pointer focus-ring rounded">
                Forgot password?
              </button>
            </div>

            {/* `loading` + `disabled` together, as PM's submit button has them
                (`login/page.tsx:264-266`). Button already swallows the right
                icon while loading, so there is no `!loading &&` guard here. */}
            <Button
              size="md"
              onClick={V.signIn}
              loading={V.signInBusy}
              disabled={V.signInBusy}
              rightIcon={<ArrowIn />}
              className="w-full justify-center"
            >
              Sign in
            </Button>

            <p className="text-center text-[12px] text-fg-2 mt-4">
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
              Tell us the address you use and we&apos;ll send a link. It stays good for an hour.
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
              className="mb-4"
            />
            <Button size="md" onClick={V.sendReset} className="w-full justify-center">
              Send me a link
            </Button>
            <div className="flex justify-center mt-4">
              <Button variant="link" size="sm" onClick={V.backToSignin} className="text-[13px]">
                Back to sign in
              </Button>
            </div>
          </>
        )}

        {V.isSent && (
          <div className="flex flex-col items-center gap-3.5 text-center">
            {/* PM's mascot, from the `Blobs.tsx` CS already ships byte-identical
                and imported nowhere. It fills with `var(--primary)`, so it is
                green here and blue there with no forked asset. At PM's own
                default size (80). */}
            <BlobHappy />
            <h1 className="text-[26px] font-semibold tracking-[-.8px] text-fg m-0">It&apos;s on its way</h1>
            <p className="text-[14px] text-fg-2 leading-relaxed max-w-[34ch] m-0">
              Check {V.loginEmail}. If it hasn&apos;t landed in a few minutes, we&apos;ll send
              another.
            </p>
            <Button variant="outline" size="md" onClick={V.sendReset}>
              Send it again
            </Button>
            <Button variant="link" size="sm" onClick={V.backToSignin} className="text-[13px]">
              Back to sign in
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
