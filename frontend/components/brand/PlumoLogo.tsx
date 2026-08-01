import React from 'react';

interface PlumoLogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** Fill for both the mark and wordmark. Defaults to the primary token. */
  color?: string;
  /** Eye stroke color. Defaults to white. */
  eyeColor?: string;
  /** Hide the wordmark and render just the blob. */
  markOnly?: boolean;
}

/**
 * Plumo full logo lockup — blob mark + lowercase "plumo" wordmark.
 */
export function PlumoLogo({
  className,
  color = 'var(--primary)',
  eyeColor = '#ffffff',
  markOnly = false,
  ...props
}: PlumoLogoProps) {
  if (markOnly) {
    return <PlumoMark className={className} color={color} eyeColor={eyeColor} {...props} />;
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 100" className={className} {...props}>
      <title>Plumo</title>
      <g transform="translate(10, 17)">
        <path
          d="M 40 4 C 60 2, 75 18, 73 38 C 81 48, 73 65, 56 66 C 51 76, 32 76, 23 68 C 5 71, -2 52, 8 40 C 0 22, 20 4, 40 4 Z"
          fill={color}
        />
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
      </g>
      <text
        x="105"
        y="72"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="56"
        fontWeight="500"
        letterSpacing="-2.5"
        fill={color}
      >
        plumo
      </text>
    </svg>
  );
}

interface PlumoMarkProps extends React.SVGAttributes<SVGSVGElement> {
  /** Pixel width/height. SVG will still scale via viewBox. */
  size?: number;
  color?: string;
  eyeColor?: string;
}

/**
 * Standalone blob mark (no wordmark). Use this wherever a compact brand
 * presence is needed — sidebar top, favicon-in-page, loader, etc.
 */
export function PlumoMark({
  size = 80,
  color = 'var(--primary)',
  eyeColor = '#ffffff',
  className,
  ...props
}: PlumoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={className}
      {...props}
    >
      <title>Plumo</title>
      <path
        d="M 40 4 C 60 2, 75 18, 73 38 C 81 48, 73 65, 56 66 C 51 76, 32 76, 23 68 C 5 71, -2 52, 8 40 C 0 22, 20 4, 40 4 Z"
        fill={color}
      />
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

export default PlumoLogo;
