'use client';

import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message?: string;
  itemName?: string;
  loading?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Delete',
  message = 'Are you sure you want to delete this item? This action cannot be undone.',
  itemName,
  loading = false,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
}) => {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={loading ? () => {} : onClose} title={title} size="sm">
      <div className="p-6">
        <div className="flex items-start gap-4">
          {/* Brand alert glyph — peach octagon for destructive, butter triangle for warning.
              Per brand spec: never red. The icon's pastel fill carries the warmth on its own
              so the legacy soft-tinted chip wrapper is redundant. */}
          <Icon
            name={variant === 'danger' ? 'state-critical' : 'state-warning'}
            size={36}
            className="flex-shrink-0"
          />

          {/* Content */}
          <div className="flex-1">
            <p className="text-sm text-fg-2">
              {itemName ? (
                <>
                  {message.replace('this item', '')}
                  <strong className="text-fg">{itemName}</strong>? This action cannot be undone.
                </>
              ) : (
                message
              )}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={handleConfirm} disabled={loading}>
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Deleting...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDeleteModal;
