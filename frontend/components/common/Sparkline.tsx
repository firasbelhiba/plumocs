'use client';

import React, { useState, useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  fill?: boolean;
  /** Optional override color (CSS color). Falls back to token-based .sparkline-line/.sparkline-area. */
  color?: string;
  /** Show hover tooltip with per-point day label + value */
  interactive?: boolean;
  /** Label formatter for tooltip (default: activity count) */
  formatLabel?: (value: number, index: number, total: number) => string;
  /** Optional label rendered below the chart (e.g. "Last 7 days") */
  showLabel?: boolean;
  labelText?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 28,
  className,
  fill = true,
  color,
  interactive = false,
  formatLabel,
  showLabel = false,
  labelText = 'Last 7 days',
}) => {
  const gradientId = useId();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data.length) return null;

  const hasActivity = data.some((v) => v > 0);
  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Empty state — dashed baseline
  if (!hasActivity) {
    return (
      <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={padding}
          y1={height / 2}
          x2={width - padding}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2,2"
          className="text-fg-3 opacity-50"
        />
      </svg>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = Math.max(max - min, 1);

  const pts = data.map((v, i) => {
    const x = padding + (data.length > 1 ? (i / (data.length - 1)) * chartWidth : chartWidth / 2);
    const y = padding + chartHeight - ((v - min) / range) * chartHeight;
    return { x, y, value: v };
  });

  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${(padding + chartWidth).toFixed(1)},${(padding + chartHeight).toFixed(1)} L${padding},${(padding + chartHeight).toFixed(1)} Z`;

  const getDayLabel = (index: number) => {
    const date = new Date();
    date.setDate(date.getDate() - (data.length - 1 - index));
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <div className="relative inline-block" onClick={(e) => e.preventDefault()}>
      <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
        {color && fill && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {fill &&
          (color ? (
            <path d={area} fill={`url(#${gradientId})`} />
          ) : (
            <path d={area} className="sparkline-area" />
          ))}
        {color ? (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path d={line} className="sparkline-line" />
        )}

        {interactive &&
          pts.map((point, index) => (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r={8}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {hoveredIndex === index && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill={color ?? 'var(--primary)'}
                  stroke="var(--surface)"
                  strokeWidth="1.5"
                />
              )}
            </g>
          ))}
      </svg>

      {interactive && hoveredIndex !== null && (
        <div
          className="absolute z-tooltip px-2 py-1 text-xs font-medium text-fg bg-surface-3 border border-[color:var(--border)] rounded-token-sm shadow-modal whitespace-nowrap pointer-events-none"
          style={{
            left: pts[hoveredIndex].x,
            top: -32,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="text-fg-3">{getDayLabel(hoveredIndex)}:</span>{' '}
          <span className="text-fg">
            {formatLabel
              ? formatLabel(pts[hoveredIndex].value, hoveredIndex, data.length)
              : `${pts[hoveredIndex].value} ${pts[hoveredIndex].value === 1 ? 'activity' : 'activities'}`}
          </span>
        </div>
      )}

      {showLabel && (
        <div className="text-3xs text-fg-3 text-center mt-0.5 leading-none">{labelText}</div>
      )}
    </div>
  );
};

export default Sparkline;
