'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef, useId } from 'react';
import { cn } from '@/lib/utils';
import { Progress } from './Progress';
import { Icon } from './Icon';

interface FileUploadProps {
  onUpload: (files: File[]) => void;
  accept?: string;
  maxSize?: number; // in MB
  multiple?: boolean;
  className?: string;
  /** When set, renders the "uploading" state with a per-file progress row */
  uploading?: { name: string; progress: number } | null;
  /** When set, renders the "error" state (replaces idle/drag-over visuals) */
  error?: string | null;
  /** Used when no explicit error is passed but internal validation fails */
  onErrorChange?: (error: string) => void;
}

// Brand-icon proxies — keep `className` API for the existing call-sites below
// so this stays a focused phase-1 swap (no extra refactor of every usage).
const PaperclipIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon name="action-attach" className={className} />
);

const DocIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon name="file-generic" className={className} />
);

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon name="state-close" className={className} />
);

export const FileUpload: React.FC<FileUploadProps> = ({
  onUpload,
  accept,
  maxSize = 10,
  multiple = true,
  className,
  uploading = null,
  error: errorProp = null,
  onErrorChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [internalError, setInternalError] = useState<string>('');
  const inputId = useId();
  const dragCounter = useRef(0);

  const error = errorProp ?? (internalError || null);

  const validateFiles = useCallback(
    (files: File[]): boolean => {
      setInternalError('');
      for (const file of files) {
        if (file.size > maxSize * 1024 * 1024) {
          const msg = `Exceeds ${maxSize} MB`;
          setInternalError(msg);
          onErrorChange?.(msg);
          return false;
        }
        if (accept) {
          const acceptedTypes = accept.split(',').map((t) => t.trim());
          const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
          const mimeType = file.type;
          const isAccepted = acceptedTypes.some((type) => {
            if (type.startsWith('.')) return fileExt === type;
            return mimeType.match(new RegExp(type.replace('*', '.*')));
          });
          if (!isAccepted) {
            const msg = `File type ${fileExt} is not accepted`;
            setInternalError(msg);
            onErrorChange?.(msg);
            return false;
          }
        }
      }
      return true;
    },
    [accept, maxSize, onErrorChange],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const fileArray = Array.from(files);
      if (validateFiles(fileArray)) onUpload(fileArray);
    },
    [onUpload, validateFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      dragCounter.current = 0;
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
    },
    [handleFiles],
  );

  // ── Uploading state ─────────────────────────────────────────────
  if (uploading) {
    return (
      <div className={cn('w-full', className)}>
        <div
          className="border rounded-token bg-surface p-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2 p-2 bg-surface-2 rounded-token-sm">
            <DocIcon className="w-4 h-4 text-fg-3 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] truncate text-fg">{uploading.name}</div>
              <div className="mt-1">
                <Progress value={uploading.progress} />
              </div>
            </div>
            <span className="font-mono text-[10px] text-fg-3 shrink-0">
              {Math.round(uploading.progress)}%
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────
  if (error) {
    return (
      <div className={cn('w-full', className)}>
        <div
          className="border-2 border-dashed rounded-token p-6 flex flex-col items-center justify-center text-center"
          style={{
            borderColor: 'var(--danger)',
            background: 'var(--danger-soft)',
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
            style={{ background: 'var(--danger)', color: 'white' }}
          >
            <XIcon className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
          <label
            htmlFor={inputId}
            className="mt-3 text-xs text-fg-3 underline cursor-pointer hover:text-fg-2"
          >
            Try another file
          </label>
          <input
            id={inputId}
            type="file"
            className="hidden"
            onChange={handleChange}
            accept={accept}
            multiple={multiple}
          />
        </div>
      </div>
    );
  }

  // ── Idle / drag-over state ───────────────────────────────────────
  return (
    <div className={cn('w-full', className)}>
      <div
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        className={cn('border-2 border-dashed rounded-token p-6 text-center transition-colors')}
        style={{
          borderColor: isDragging ? 'var(--primary)' : 'var(--border-strong)',
          background: isDragging ? 'var(--primary-soft)' : 'transparent',
        }}
      >
        <input
          id={inputId}
          type="file"
          className="hidden"
          onChange={handleChange}
          accept={accept}
          multiple={multiple}
        />
        <label htmlFor={inputId} className="cursor-pointer flex flex-col items-center">
          <PaperclipIcon
            className={cn(
              'w-5 h-5 mb-2 transition-colors',
              isDragging ? 'text-[color:var(--primary)]' : 'text-fg-3',
            )}
          />
          {isDragging ? (
            <p className="text-[13px] font-medium text-[color:var(--primary)]">Drop to upload</p>
          ) : (
            <p className="text-[13px] text-fg-2">
              Drop or <span className="text-[color:var(--primary)]">browse</span>
            </p>
          )}
          {(accept || maxSize) && !isDragging && (
            <p className="text-[11px] text-fg-3 mt-1">
              {accept && `${accept}`}
              {accept && maxSize ? ' · ' : ''}
              {maxSize && `Max ${maxSize} MB`}
            </p>
          )}
        </label>
      </div>
    </div>
  );
};

// Preview component for uploaded files - with proper blob URL cleanup
export const FilePreview: React.FC<{
  files: File[];
  onRemove: (index: number) => void;
}> = ({ files, onRemove }) => {
  const previewUrls = useMemo(() => {
    return files.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null));
  }, [files]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  return (
    <div className="mt-3 space-y-2">
      {files.map((file, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-2.5 bg-surface-2 border rounded-token-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {previewUrls[index] ? (
                <img
                  src={previewUrls[index]!}
                  alt={file.name}
                  className="w-9 h-9 object-cover rounded"
                />
              ) : (
                <div className="w-9 h-9 bg-surface-3 rounded flex items-center justify-center">
                  <DocIcon className="w-4 h-4 text-fg-3" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-fg truncate">{file.name}</p>
              <p className="text-[11px] text-fg-3">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="flex-shrink-0 p-1 text-fg-3 hover:text-[color:var(--danger)] transition-colors"
            aria-label="Remove file"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
