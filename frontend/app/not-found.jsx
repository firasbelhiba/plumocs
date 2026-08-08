'use client';

// App-router 404, from PM's `src/app/not-found.tsx`. Fires for any unmatched
// route. The console has its own in-shell `NotFound` screen for a conversation
// that has gone; this one is for a URL that never resolved to the app at all,
// so there is no shell to sit inside.

import React from 'react';
import { useRouter } from 'next/navigation';
import { ErrorScreen } from '@/components/common';

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <ErrorScreen
      illustration="/brand/empty-states/plumo-404.svg"
      badge="404"
      title="we can't find that one"
      description={
        <>
          the link may be old, or the page may have moved. nothing is lost — it&apos;s just not
          here.
        </>
      }
      primaryAction={{ label: 'go back', onClick: () => router.back() }}
      secondaryAction={{
        label: 'back to the inbox',
        variant: 'outline',
        onClick: () => router.push('/'),
      }}
    />
  );
}
