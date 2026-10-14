import React from 'react';

export interface ProgressBarProps {
  progress: number; // 0-100
  variant?: 'default' | 'warning' | 'danger';
  label?: string;
  /** Name for assistive tech when no visible label is shown. */
  ariaLabel?: string;
  showPercentage?: boolean;
}

const fill = {
  default: 'bg-accent',
  warning: 'bg-warn-text',
  danger: 'bg-danger',
};

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, variant = 'default', label, ariaLabel, showPercentage = true }) => {
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="mb-1.5 flex items-center justify-between text-sm">
          {label && <span className="text-ink">{label}</span>}
          {showPercentage && <span className="text-ink-3 tabular-nums">{Math.round(clamped)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label ?? 'Progress'}
        className="h-1.5 w-full overflow-hidden rounded-full bg-sunk"
      >
        <div className={`h-full rounded-full transition-[width] duration-200 ${fill[variant]}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
};

export const CircularProgress: React.FC<{
  progress: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'default' | 'warning' | 'danger';
}> = ({ progress, size = 120, strokeWidth = 8, variant = 'default' }) => {
  const clamped = Math.min(100, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (clamped / 100) * circumference;
  const stroke = { default: 'text-accent', warning: 'text-warn-text', danger: 'text-danger' }[variant];

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle className="text-sunk" strokeWidth={strokeWidth} stroke="currentColor" fill="transparent" r={radius} cx={size / 2} cy={size / 2} />
        <circle
          className={stroke}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: 'stroke-dashoffset .2s' }}
        />
      </svg>
      <span className="absolute text-xl font-semibold tabular-nums text-ink">{Math.round(clamped)}%</span>
    </div>
  );
};
