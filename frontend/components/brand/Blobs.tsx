import React from 'react';

/**
 * Plumo blob expressions — the brand mascot rendered in different moods.
 *
 * Usage guide:
 *   happy       → default, most UI
 *   sleepy      → idle / end-of-day
 *   focused     → deep work / focus mode
 *   celebrating → completion, wins
 *   lost        → 404 / error states
 *
 * The remaining expressions from BRAND.md (`curious`, `thinking`, `waving`)
 * are not yet in the source — swap them in when shipped.
 */

interface BlobProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  color?: string;
  eyeColor?: string;
}

const BLOB_PATH =
  'M 40 4 C 60 2, 75 18, 73 38 C 81 48, 73 65, 56 66 C 51 76, 32 76, 23 68 C 5 71, -2 52, 8 40 C 0 22, 20 4, 40 4 Z';

export function BlobHappy({
  size = 80,
  color = 'var(--primary)',
  eyeColor = '#ffffff',
  ...props
}: BlobProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-5 -10 90 90"
      {...props}
    >
      <path d={BLOB_PATH} fill={color} />
      <path
        d="M 22 34 Q 28 27, 34 34"
        fill="none"
        stroke={eyeColor}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M 46 34 Q 52 27, 58 34"
        fill="none"
        stroke={eyeColor}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BlobSleepy({ size = 80, ...props }: BlobProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-5 -10 90 90"
      {...props}
    >
      {/* Sleepy uses a deeper shade, hardcoded per the brand spec. */}
      <path d={BLOB_PATH} fill="#1E40AF" />
      <path d="M 22 34 L 34 34" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M 46 34 L 58 34" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <text
        x="62"
        y="14"
        fontFamily="Inter, sans-serif"
        fontSize="12"
        fontWeight="500"
        fill="#60A5FA"
      >
        z
      </text>
      <text
        x="70"
        y="22"
        fontFamily="Inter, sans-serif"
        fontSize="9"
        fontWeight="500"
        fill="#60A5FA"
      >
        z
      </text>
    </svg>
  );
}

export function BlobFocused({ size = 80, ...props }: BlobProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-5 -10 90 90"
      {...props}
    >
      <path d={BLOB_PATH} fill="var(--primary)" />
      <path d="M 22 32 L 34 32" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M 46 32 L 58 32" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function BlobCelebrating({ size = 80, ...props }: BlobProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-10 -20 100 100"
      {...props}
    >
      <path d={BLOB_PATH} fill="var(--primary)" />
      <path
        d="M 22 30 Q 28 22, 34 30"
        fill="none"
        stroke="#fff"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M 46 30 Q 52 22, 58 30"
        fill="none"
        stroke="#fff"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Confetti — peach + sky accents from the Plumo palette. */}
      <circle cx="5" cy="-5" r="2.5" fill="#FFD4B8" />
      <circle cx="15" cy="-12" r="2" fill="var(--primary)" />
      <rect x="65" y="-8" width="4" height="4" fill="#FFD4B8" transform="rotate(20 67 -6)" />
      <circle cx="78" cy="-2" r="2.5" fill="#60A5FA" />
    </svg>
  );
}

export function BlobLost({ size = 80, ...props }: BlobProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-5 -10 90 90"
      {...props}
    >
      <path d={BLOB_PATH} fill="#60A5FA" />
      <path
        d="M 24 31 L 32 37 M 24 37 L 32 31"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="52" cy="34" r="3" fill="#fff" />
      <path
        d="M 65 15 Q 70 12, 72 16 Q 74 20, 70 22 Q 66 24, 64 20"
        fill="none"
        stroke="#7A3E1F"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
