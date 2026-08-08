'use client';

/**
 * The page the emailed invitation link lands on.
 *
 * Sibling of app/reset-password/page.jsx, and deliberately built to the same
 * shape: one token in the query string, one server call to find out whether it
 * still means anything, and a small number of honest endings. The wash, the
 * mark, the phase machine and the copy voice are that page's — this is the same
 * moment in the same product, and a different-looking page at the point where
 * somebody is deciding whether to trust us with a password reads as a different
 * site.
 *
 * Client-only, and the token is read from window.location rather than
 * useSearchParams: the console is rendered with ssr:false (state lives on the
 * document), and useSearchParams would force this route into a Suspense
 * boundary at build time for a value we only need after mount.
 */

import React from 'react';
import { invitations } from '@/lib/api/endpoints';
import { setSession } from '@/lib/api/client';
import { Button, Input } from '@/components/common';
import { BlobHappy } from '@/components/brand';

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

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M4.8 19.5a7.2 7.2 0 0114.4 0" />
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

/** Matches the accept DTO's @MinLength(8) — say it before the round trip. */
const MIN_LENGTH = 8;

const ROLE_BLURB = {
  admin: 'as an admin, with settings, people and billing included',
  lead: 'as a team lead',
  agent: 'as an agent',
};

/**
 * Why a link is no good.
 *
 * The lookup answers `{ valid: false }` for all three reasons, so prefer
 * whatever the server chose to say — a `reason`/`status` field on the body, or
 * the message on the error it threw — and only fall back to naming all three
 * when it said nothing. Better to list the possibilities than to assert the
 * wrong one.
 */
const DEAD_FALLBACK =
  'Invitation links last seven days and can only be used once. This one is past that, has already been used, or was revoked.';

/** A bare state word is a label, not something to print at somebody. */
const STATE_SENTENCE = {
  expired: 'This invitation has expired. They last seven days.',
  accepted: 'This invitation has already been used. Try signing in instead.',
  used: 'This invitation has already been used. Try signing in instead.',
  revoked: 'This invitation was withdrawn. Ask an admin to send a new one.',
  workspace_inactive: 'That desk is not available right now. Please contact your administrator.',
};

function deadReason(source) {
  if (!source) return '';
  if (typeof source === 'string') return source;
  // Human sentences first, machine labels second: the server may send either,
  // and a written reason always beats one this page reconstructed from a word.
  const named = [
    source.reason,
    // the client's own placeholder is not a sentence anybody should read
    /^Request failed \(\d+\)$/.test(source.message ?? '') ? null : source.message,
    source.state,
    // `status` is a state word on an invitation body and a number on an ApiError
    typeof source.status === 'string' ? source.status : null,
  ].find((v) => typeof v === 'string' && v);
  if (!named) return '';
  const key = named.toLowerCase();
  if (key === 'pending' || key === 'valid') return '';
  return STATE_SENTENCE[key] ?? named;
}

export default function AcceptInvitePage() {
  // 'reading' until the token has been looked up: rendering a password form and
  // then yanking it away a tick later, when the link turns out to be spent, is
  // worse than a beat of nothing.
  const [phase, setPhase] = React.useState('reading');
  const [token, setToken] = React.useState('');
  const [invite, setInvite] = React.useState(null); // { email, workspaceName, role, needsPassword }
  const [name, setName] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [shown, setShown] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  const lookup = React.useCallback(async (t) => {
    setPhase('reading');
    try {
      const data = await invitations.lookup(t);
      if (!data || data.valid === false) {
        setNotice(deadReason(data) || DEAD_FALLBACK);
        setPhase('dead');
        return;
      }
      setInvite(data);
      setNotice('');
      setPhase(data.needsPassword ? 'form' : 'confirm');
    } catch (e) {
      if (e?.status === 0) {
        setPhase('offline');
      } else {
        setNotice(deadReason(e) || DEAD_FALLBACK);
        setPhase('dead');
      }
    }
  }, []);

  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    if (!t) {
      setNotice('That link is missing its token. Open the one in your email again.');
      setPhase('dead');
      return;
    }
    // The token is spent the moment it is in memory; keeping it in the address
    // bar leaves it in history and in any Referer this page sends. Which is
    // also why "try again" below re-runs the call rather than reloading — after
    // this line there is no token left in the URL to reload.
    window.history.replaceState({}, '', window.location.pathname);
    lookup(t);
  }, [lookup]);

  const accept = async () => {
    const needsPassword = !!invite?.needsPassword;
    if (needsPassword) {
      if (!name.trim()) {
        setNotice('Please enter your name');
        return;
      }
      if (pw.length < MIN_LENGTH) {
        setNotice(`Password must be at least ${MIN_LENGTH} characters`);
        return;
      }
    }
    setNotice('');
    // Where a recoverable failure puts them back. Derived from the invitation
    // rather than the current phase, because "try again" is also reachable from
    // the offline screen, and landing back on *that* would be a dead end.
    const back = needsPassword ? 'form' : 'confirm';
    setPhase('joining');
    try {
      const session = await invitations.accept(
        token,
        needsPassword ? { name: name.trim(), password: pw } : {},
      );
      // Store it exactly the way logging in does, so the console finds a real
      // session on the next page load and they land inside the app rather than
      // on a sign-in screen holding a password they just chose. `workspace` is
      // part of that shape: it is what puts X-Workspace-Slug on every later
      // request.
      setSession(
        {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: session.user,
          workspace: session.workspace ?? null,
        },
        { persist: true },
      );
      setPhase('landing');
      window.location.assign('/');
    } catch (e) {
      // Three different answers, because they need three different things:
      //   offline — nothing happened, press the button again;
      //   spent/invalid — the link is gone and no amount of retrying helps;
      //   anything else — keep the form and what they typed.
      //
      // 403 belongs in the terminal list, not the retryable one. The accept
      // endpoint raises it in exactly two places — a suspended workspace and a
      // globally disabled account — and neither is something the invitee can
      // fix by pressing the button again. Leaving it in the fallback branch put
      // them back on a form whose only outcome is the same 403 forever. The
      // throttler answers 429, so nothing transient lands here.
      if (e?.status === 0) {
        setPhase('offline');
      } else if ([401, 403, 404, 409, 410].includes(e?.status)) {
        setNotice(deadReason(e) || DEAD_FALLBACK);
        setPhase('dead');
      } else {
        setNotice(e?.message || 'Something went wrong. Please try again.');
        setPhase(back);
      }
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && phase === 'form') accept();
  };

  const desk = invite?.workspaceName || 'this desk';
  const roleLine = ROLE_BLURB[invite?.role] || (invite?.role ? `as ${invite.role}` : '');

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

        {phase === 'reading' && <p className="text-[14px] text-fg-2 text-center">Loading…</p>}

        {phase === 'landing' && (
          <p className="text-[14px] text-fg-2 text-center">Taking you in…</p>
        )}

        {(phase === 'form' || (phase === 'joining' && invite?.needsPassword)) && (
          <>
            <h1 className="text-[30px] font-semibold tracking-[-1px] text-center text-fg mb-2">
              Join {desk}.
            </h1>
            <p className="text-[14px] text-fg-2 text-center leading-relaxed mb-[26px]">
              You have been invited {roleLine ? roleLine + ' ' : ''}as{' '}
              <span className="text-fg">{invite?.email}</span>. Choose a password and you are in.
            </p>

            {notice && (
              <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-token-sm mb-4 text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                <WarnIcon />
                <span>{notice}</span>
              </div>
            )}

            <div className="flex flex-col gap-3.5">
              <Input
                id="invite-name"
                label="Your name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onKey}
                placeholder="The name your team will see"
                autoComplete="name"
                leftIcon={<PersonIcon />}
                className="h-[44px] !rounded-[10px] text-[14px]"
              />
              <Input
                id="invite-password"
                type={shown ? 'text' : 'password'}
                label="Choose a password"
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
            </div>

            <Button
              size="lg"
              onClick={accept}
              disabled={phase === 'joining'}
              className="w-full h-[44px] rounded-[10px] text-[15px] mt-5"
            >
              {phase === 'joining' ? 'Setting you up…' : 'Join the desk'}
            </Button>

            <div className="flex justify-center mt-4">
              <a href="/" className="text-[13px] text-fg-2 hover:text-fg transition-colors">
                Already have an account? Sign in
              </a>
            </div>
          </>
        )}

        {(phase === 'confirm' || (phase === 'joining' && !invite?.needsPassword)) && (
          <div className="flex flex-col items-center gap-3.5 text-center">
            {/* PM's mascot at PM's default size — see components/brand/Blobs.tsx. */}
            <BlobHappy />
            <h1 className="text-[26px] font-semibold tracking-[-.8px] text-fg m-0">
              You&apos;ve been added to {desk}
            </h1>
            <p className="text-[14px] text-fg-2 leading-relaxed max-w-[36ch] m-0">
              <span className="text-fg">{invite?.email}</span> already has a plumo account, so
              there is nothing to set up. Accepting simply puts this desk on it
              {roleLine ? `, ${roleLine}` : ''}. Your password stays exactly as it is.
            </p>

            {notice && (
              <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-token-sm text-left text-[13px] bg-[color:var(--danger-soft)] text-[color:var(--danger)]">
                <WarnIcon />
                <span>{notice}</span>
              </div>
            )}

            <Button
              size="lg"
              onClick={accept}
              disabled={phase === 'joining'}
              className="w-full h-[44px] rounded-[10px] text-[15px] mt-1"
            >
              {phase === 'joining' ? 'Working…' : 'Accept and go in'}
            </Button>
          </div>
        )}

        {phase === 'dead' && (
          <div className="flex flex-col items-center gap-3.5 text-center">
            <h1 className="text-[26px] font-semibold tracking-[-.8px] text-fg m-0">
              This invitation won&apos;t work.
            </h1>
            <p className="text-[14px] text-fg-2 leading-relaxed max-w-[36ch] m-0">
              {notice || DEAD_FALLBACK}
            </p>
            <p className="text-[13px] text-fg-3 leading-relaxed max-w-[36ch] m-0">
              Ask whoever invited you to send a fresh one. They can do it from Settings › Team
              &amp; users.
            </p>
            <a href="/">
              <Button size="md" className="rounded-token-sm">
                Go to sign in
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
              Nothing was changed and your invitation is still good. Please try again in a moment.
            </p>
            <Button
              variant="secondary"
              size="md"
              onClick={() => (invite ? accept() : lookup(token))}
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
