import React from 'react';

export type PriorityLevel = 'urgent' | 'high' | 'medium' | 'low' | 'none';

// Plumo priority blobs — see trash/plumo-brand/10-priority-status. The blob
// fill encodes urgency (mist → sky → butter → peach) and the eyes/mouth
// give each one a personality. Outline color is theme-aware via
// --plumo-blob-stroke (navy in light, white in dark); eyes are pinned to
// plumo-night in both themes for legibility against the pastel fills.
//
// Mapping from our 5-tier IssuePriority scale to the brand's 4 blobs:
//   urgent → high (peach, focused)
//   high   → medium (butter, alert dots)
//   medium → low (sky, happy)
//   low    → no rush (mist, sleeping)
//   none   → ghosted no-rush (mist at low opacity)
type Blob = 'no-rush' | 'low' | 'medium' | 'high';

const LEVEL_TO_BLOB: Record<PriorityLevel, Blob | null> = {
  urgent: 'high',
  high: 'medium',
  medium: 'low',
  low: 'no-rush',
  none: null,
};

const BLOB_FILL: Record<Blob, string> = {
  'no-rush': 'var(--plumo-mist)',
  low: 'var(--plumo-sky)',
  medium: 'var(--plumo-butter)',
  high: 'var(--plumo-peach)',
};

const LABELS: Record<PriorityLevel, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};

// Shared blob silhouette — same path on every variant.
const BLOB_PATH =
  'M 40 4 C 60 2, 75 18, 73 38 C 81 48, 73 65, 56 66 C 51 76, 32 76, 23 68 C 5 71, -2 52, 8 40 C 0 22, 20 4, 40 4 Z';

const NAVY = '#1E3A8A';

function BlobFace({ blob }: { blob: Blob }) {
  switch (blob) {
    case 'no-rush':
      // sleeping — closed eyes (two horizontal lines)
      return (
        <>
          <path d="M 22 36 L 32 36" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 48 36 L 58 36" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case 'low':
      // happy — squinty smile arches
      return (
        <>
          <path
            d="M 22 34 Q 28 27, 34 34"
            stroke={NAVY}
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 46 34 Q 52 27, 58 34"
            stroke={NAVY}
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    case 'medium':
      // alert — round dot eyes
      return (
        <>
          <circle cx="28" cy="34" r="3.5" fill={NAVY} />
          <circle cx="52" cy="34" r="3.5" fill={NAVY} />
        </>
      );
    case 'high':
      // focused — intense thick lines
      return (
        <>
          <path d="M 22 32 L 34 32" stroke={NAVY} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M 46 32 L 58 32" stroke={NAVY} strokeWidth="4.5" strokeLinecap="round" />
        </>
      );
  }
}

interface PriorityBarsProps {
  level: PriorityLevel;
  className?: string;
  /** Pixel size for the blob. Defaults to 22px — brand recommends 18–20 for
      task rows, but the small blob faces lose personality below ~22 in
      practice. Bump or shrink per call site if needed. */
  size?: number;
}

export const PriorityBars: React.FC<PriorityBarsProps> = ({ level, className, size = 22 }) => {
  const blob = LEVEL_TO_BLOB[level];

  // No-priority — ghost a no-rush blob so the row still has an anchor.
  if (!blob) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className ?? ''}`}
        style={{ width: size, height: size, color: 'var(--plumo-blob-stroke)', opacity: 0.4 }}
        title={LABELS[level]}
        aria-label={LABELS[level]}
      >
        <svg
          width={size}
          height={size}
          viewBox="-4 -6 88 88"
          fill="none"
          shapeRendering="geometricPrecision"
          aria-hidden
        >
          <path
            d={BLOB_PATH}
            fill={BLOB_FILL['no-rush']}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size, color: 'var(--plumo-blob-stroke)' }}
      title={LABELS[level]}
      aria-label={LABELS[level]}
    >
      <svg
        width={size}
        height={size}
        viewBox="-4 -6 88 88"
        fill="none"
        shapeRendering="geometricPrecision"
        aria-hidden
      >
        <path
          d={BLOB_PATH}
          fill={BLOB_FILL[blob]}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <BlobFace blob={blob} />
      </svg>
    </span>
  );
};

export default PriorityBars;
