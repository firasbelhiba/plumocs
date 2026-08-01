'use client';

import React from 'react';

interface PlumoAnimatedIconProps {
  /** Outer tile size in px. Corner radius scales proportionally. */
  size?: number;
  className?: string;
}

/**
 * Animated plumo app icon: primary-blue rounded tile with a breathing blob
 * and blinking eyes. Ported from `plumo-app-icon-animated.html` and
 * re-expressed as a self-contained React/SVG component.
 *
 * The *static* look (blue tile, centering, blob size) is set via inline styles
 * so it paints correctly on the very first frame — including the server-rendered
 * HTML. Only the animations live in `styled-jsx`, whose CSS is injected at
 * runtime; keeping the background there previously caused a white-blob→blue-tile
 * flash on boot before the styles landed.
 */
export const PlumoAnimatedIcon: React.FC<PlumoAnimatedIconProps> = ({ size = 56, className }) => {
  const radius = Math.round(size * (80 / 360)); // keeps proto radius ratio

  return (
    <div
      className={`plumo-loader-icon ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: '#2563EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)',
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 80 80"
        xmlns="http://www.w3.org/2000/svg"
        className="blob"
        style={{ width: '62%', height: '62%', transformOrigin: 'center' }}
      >
        {/* Soft blob */}
        <path
          d="M 40 4 C 60 2, 75 18, 73 38 C 81 48, 73 65, 56 66 C 51 76, 32 76, 23 68 C 5 71, -2 52, 8 40 C 0 22, 20 4, 40 4 Z"
          fill="#FFFFFF"
        />
        {/* Open eyes (arch) */}
        <g className="eyes-open">
          <path
            d="M 22 34 Q 28 27, 34 34"
            fill="none"
            stroke="#2563EB"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M 46 34 Q 52 27, 58 34"
            fill="none"
            stroke="#2563EB"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </g>
        {/* Closed eyes (straight line) — hidden until the blink animation runs */}
        <g className="eyes-closed" style={{ opacity: 0 }}>
          <path
            d="M 22 32 L 34 32"
            fill="none"
            stroke="#2563EB"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M 46 32 L 58 32"
            fill="none"
            stroke="#2563EB"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </g>
      </svg>

      <style jsx>{`
        .blob {
          animation: plumo-breathe 3s ease-in-out infinite;
        }
        :global(.plumo-loader-icon .eyes-open) {
          animation: plumo-eyes-open 2s ease-in-out infinite;
        }
        :global(.plumo-loader-icon .eyes-closed) {
          animation: plumo-eyes-closed 2s ease-in-out infinite;
        }
        @keyframes plumo-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.04);
          }
        }
        @keyframes plumo-eyes-open {
          0%,
          85%,
          100% {
            opacity: 1;
          }
          90%,
          95% {
            opacity: 0;
          }
        }
        @keyframes plumo-eyes-closed {
          0%,
          85%,
          100% {
            opacity: 0;
          }
          90%,
          95% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default PlumoAnimatedIcon;
