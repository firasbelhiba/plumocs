'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';

export interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + critical framing for destructive actions. */
  danger?: boolean;
}

export interface PromptOptions {
  title?: string;
  message?: React.ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render a multi-line textarea instead of a single-line input. */
  multiline?: boolean;
  /** Disable the confirm button until the field is non-empty. */
  required?: boolean;
}

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

type ActiveDialog =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

const DialogContext = createContext<DialogContextValue | null>(null);

const inputClasses =
  'w-full px-3 py-2 border border-[color:var(--border-strong)] rounded-md focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-800 dark:text-white';

/**
 * App-wide styled replacement for the native `window.confirm` / `window.prompt`.
 * Provides promise-based `useConfirm()` and `usePrompt()` so call sites read like
 * the browser primitives they replace:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: 'Delete this?', danger: true }))) return;
 *
 *   const prompt = usePrompt();
 *   const name = await prompt({ title: 'Rename', defaultValue: current });
 *   if (name === null) return; // cancelled
 */
export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const [inputValue, setInputValue] = useState('');
  // Guard against a stale promise if a dialog is somehow re-requested while open.
  const activeRef = useRef<ActiveDialog | null>(null);
  activeRef.current = active;

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setActive({ kind: 'confirm', options, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setInputValue(options.defaultValue ?? '');
        setActive({ kind: 'prompt', options, resolve });
      }),
    [],
  );

  const handleCancel = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    if (current.kind === 'confirm') current.resolve(false);
    else current.resolve(null);
    setActive(null);
  }, []);

  const handleConfirm = useCallback(() => {
    const current = activeRef.current;
    if (!current) return;
    if (current.kind === 'confirm') current.resolve(true);
    else current.resolve(inputValue);
    setActive(null);
  }, [inputValue]);

  const options = active?.options;
  const isPrompt = active?.kind === 'prompt';
  const promptRequiredUnmet =
    isPrompt && Boolean((active.options as PromptOptions).required) && !inputValue.trim();

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {active && options && (
        <Modal
          isOpen
          onClose={handleCancel}
          title={options.title}
          ariaLabel={options.title ? undefined : 'Dialog'}
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={handleCancel}>
                {options.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={active.kind === 'confirm' && active.options.danger ? 'danger' : 'primary'}
                onClick={handleConfirm}
                disabled={promptRequiredUnmet}
              >
                {options.confirmLabel ?? (active.kind === 'confirm' ? 'Confirm' : 'Save')}
              </Button>
            </>
          }
        >
          {active.kind === 'confirm' ? (
            <p className="text-[13px] text-fg-2 leading-relaxed">{active.options.message}</p>
          ) : (
            <div className="space-y-2">
              {active.options.message && (
                <p className="text-[13px] text-fg-2 leading-relaxed">{active.options.message}</p>
              )}
              {active.options.label && (
                <label className="block text-sm font-medium text-fg-2">
                  {active.options.label}
                </label>
              )}
              {active.options.multiline ? (
                <textarea
                  autoFocus
                  rows={3}
                  value={inputValue}
                  placeholder={active.options.placeholder}
                  onChange={(e) => setInputValue(e.target.value)}
                  className={inputClasses}
                />
              ) : (
                <input
                  autoFocus
                  type="text"
                  value={inputValue}
                  placeholder={active.options.placeholder}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !promptRequiredUnmet) {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                  className={inputClasses}
                />
              )}
            </div>
          )}
        </Modal>
      )}
    </DialogContext.Provider>
  );
};

const useDialogContext = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useConfirm/usePrompt must be used within a <DialogProvider>');
  }
  return ctx;
};

/** Returns a promise-based confirm dialog. Resolves true on confirm, false on cancel. */
export const useConfirm = (): DialogContextValue['confirm'] => useDialogContext().confirm;

/** Returns a promise-based prompt dialog. Resolves the entered string, or null on cancel. */
export const usePrompt = (): DialogContextValue['prompt'] => useDialogContext().prompt;
