'use client';

import dynamic from 'next/dynamic';
import { useConfirm } from '@/contexts/DialogContext';

// The console is a fully client-side, stateful app (theme/density live on the
// <html> element, timers tick every second) — render it client-only.
const Console = dynamic(() => import('@/components/Console'), { ssr: false });

export default function Page() {
  // The console is a class component and spends its one `contextType` on the
  // theme, so the dialog service arrives as a prop rather than through context.
  const confirm = useConfirm();

  // The console opens on the inbox; the design's index-of-pages screen was a
  // template artefact and is gone.
  return <Console role="lead" startScreen="queue" confirm={confirm} />;
}
