'use client';

import React, { useState } from 'react';

interface MiniActivityChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  showLabel?: boolean;
}

export const MiniActivityChart: React.FC<MiniActivityChartProps> = ({
  data,
  width = 100,
  height = 28,
  color = '#22c55e', // green-500
  className = '',
  showLabel = false,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return null;
  }

  const maxValue = Math.max(...data, 1); // Ensure at least 1 to avoid division by zero
  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Calculate points for the polyline and store coordinates
  const pointsData = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - (value / maxValue) * chartHeight;
    return { x, y, value };
  });

  const points = pointsData.map((p) => `${p.x},${p.y}`).join(' ');

  // Create area fill path
  const areaPathString = `M${padding},${padding + chartHeight} L${pointsData.map((p) => `${p.x},${p.y}`).join(' L')} L${padding + chartWidth},${padding + chartHeight} Z`;

  // Check if there's any activity
  const hasActivity = data.some((v) => v > 0);

  // Get day label (e.g., "Mon", "Tue", etc.)
  const getDayLabel = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - (data.length - 1 - daysAgo));
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  return (
    <div className="relative inline-block" onClick={(e) => e.preventDefault()}>
      <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
        {hasActivity ? (
          <>
            {/* Gradient fill under the line */}
            <defs>
              <linearGradient
                id={`gradient-${color.replace('#', '')}`}
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
              >
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Area fill */}
            <path d={areaPathString} fill={`url(#gradient-${color.replace('#', '')})`} />

            {/* Line */}
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Interactive hover points */}
            {pointsData.map((point, index) => (
              <g key={index}>
                {/* Larger invisible hit area */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={8}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                {/* Visible dot on hover */}
                {hoveredIndex === index && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={3}
                    fill={color}
                    stroke="white"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            ))}
          </>
        ) : (
          // Show a flat line when no activity
          <line
            x1={padding}
            y1={height / 2}
            x2={width - padding}
            y2={height / 2}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2,2"
            className="text-gray-300 dark:text-fg-2"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && hasActivity && (
        <div
          className="absolute z-tooltip px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg whitespace-nowrap pointer-events-none"
          style={{
            left: pointsData[hoveredIndex].x,
            top: -28,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="text-gray-300">{getDayLabel(hoveredIndex)}:</span>{' '}
          <span className="text-white">
            {pointsData[hoveredIndex].value}{' '}
            {pointsData[hoveredIndex].value === 1 ? 'activity' : 'activities'}
          </span>
          {/* Tooltip arrow */}
          <div
            className="absolute w-2 h-2 bg-gray-900 dark:bg-gray-700 transform rotate-45"
            style={{
              left: '50%',
              bottom: -4,
              marginLeft: -4,
            }}
          />
        </div>
      )}

      {/* Label */}
      {showLabel && (
        <div className="text-3xs text-fg-3 text-center mt-0.5 leading-none">Last 7 days</div>
      )}
    </div>
  );
};
