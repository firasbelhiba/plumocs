'use client';

import dynamic from 'next/dynamic';

// The console is a fully client-side, stateful app (theme/density live on the
// <html> element, timers tick every second) — render it client-only.
const Console = dynamic(() => import('@/components/Console'), { ssr: false });

export default function Page() {
  // Defaults mirror the design's data-props: light theme, balanced density,
  // green accent, lead role, index start screen.
  return <Console theme="light" softness="balanced" role="lead" startScreen="index" />;
}
