'use client';

// App-router error boundary, from PM's `src/app/error.tsx`. Fires for anything
// thrown inside a route segment under app/. Before this file existed an
// uncaught render in the console threw to a blank white page — `ErrorScreen`
// and `ErrorBoundary` were both ported and neither was ever rendered.

import React, { useEffect } from 'react';
import { ErrorScreen } from '@/components/common';
import { logger } from '@/lib/logger';

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    logger.error('Route error boundary caught:', error);
  }, [error]);

  // Only show the raw stack in dev. In prod the digest is the only thing worth
  // surfacing — the real stack is in the server logs anyway.
  const details =
    process.env.NODE_ENV === 'production'
      ? error?.digest
        ? `digest: ${error.digest}`
        : undefined
      : `${error?.message ?? ''}\n\n${error?.stack ?? ''}`;

  return (
    <ErrorScreen
      illustration="/brand/empty-states/plumo-500.svg"
      badge="500"
      title="that didn't work, and it's on us"
      description={
        <>
          your work is safe — nothing you wrote has gone anywhere. try again in a moment, or head
          back to the inbox.
        </>
      }
      primaryAction={{ label: 'Try again', onClick: reset }}
      secondaryAction={{
        label: 'Back to the inbox',
        variant: 'outline',
        onClick: () => {
          window.location.href = '/';
        },
      }}
      details={details}
    />
  );
}
