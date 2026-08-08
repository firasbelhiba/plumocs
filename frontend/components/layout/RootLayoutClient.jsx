'use client';

import React from 'react';
import { Toaster } from 'react-hot-toast';
import { DialogProvider } from '@/contexts/DialogContext';

/**
 * The client half of the root layout, mirroring PM's
 * `src/components/layout/RootLayout.tsx:50-97`.
 *
 * Two app-wide services live here rather than in component state:
 *   - `<DialogProvider>` — the promise-based confirm/prompt the console used to
 *     thread through `renderVals()`.
 *   - `<Toaster>` — one configuration for every toast in the app. The options
 *     below are PM's `RootLayout.tsx:57-94` verbatim; every value resolves
 *     through a token, so the toast follows the theme instead of being a
 *     hardcoded navy pill.
 *
 * PM also mounts i18n, the achievement notifier and the changelog notifier here;
 * the support console has none of those.
 */
export default function RootLayoutClient({ children }) {
  return (
    <DialogProvider>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            padding: '10px 14px',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-modal)',
            fontSize: '13px',
            fontWeight: 500,
          },
          success: {
            iconTheme: {
              primary: 'var(--success)',
              secondary: 'var(--surface)',
            },
            style: {
              background: 'var(--success-soft)',
              color: 'var(--success)',
              border: '1px solid transparent',
            },
          },
          error: {
            iconTheme: {
              primary: 'var(--danger)',
              secondary: 'var(--surface)',
            },
            style: {
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              border: '1px solid transparent',
            },
          },
        }}
      />
    </DialogProvider>
  );
}
