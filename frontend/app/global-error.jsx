'use client';

// Root-level fallback, from PM's `src/app/global-error.tsx`. Fires when the
// root layout itself throws, so it must render its own <html>/<body> — the
// layout that normally provides them is the thing that failed. Inline styles
// only, and literal hex: `globals.css` is imported by that same broken layout,
// so no custom property is guaranteed to resolve here.
//
// The two brand colours are the CS greens (`--primary` #4C9F6E, `--cs-forest`
// #1F4A2E) rather than PM's #2563EB / #1E3A8A. Everything else — the neutrals,
// the card geometry, the copy shape — is PM's.

import React, { useEffect } from 'react';
import { logger } from '@/lib/logger';

export default function GlobalErrorPage({ error, reset }) {
  useEffect(() => {
    logger.error('Root layout crashed:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          background: '#f8fafc',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#0f172a',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            background: '#ffffff',
            border: '1px solid #e4e4e7',
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            boxShadow: '0 1px 2px 0 rgba(0,0,0,0.04), 0 1px 1px 0 rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                background: '#f4f4f5',
                color: '#52525b',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              }}
            >
              500
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <img
              src="/assets/mascots/mascot-03-empathetic.svg"
              alt=""
              width={180}
              height={180}
              style={{ maxWidth: '100%', height: 'auto' }}
            />
          </div>

          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: '0 0 8px',
              color: '#1F4A2E',
            }}
          >
            that didn&apos;t work, and it&apos;s on us
          </h1>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: '#52525b',
              margin: 0,
              maxWidth: 360,
              marginInline: 'auto',
            }}
          >
            the console couldn&apos;t recover on its own — refreshing usually fixes it.
          </p>

          <div
            style={{
              marginTop: 24,
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#4C9F6E',
                color: '#ffffff',
                border: 'none',
                borderRadius: 9999,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              style={{
                background: 'transparent',
                color: '#0f172a',
                border: '1px solid #d4d4d8',
                borderRadius: 6,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              back to the inbox
            </button>
          </div>

          {error?.digest && (
            <div
              style={{
                marginTop: 24,
                fontSize: 11,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                color: '#a1a1aa',
              }}
            >
              digest: {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
