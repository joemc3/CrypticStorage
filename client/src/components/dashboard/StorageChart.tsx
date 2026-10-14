import React from 'react';
import { formatFileSize } from '../../services/file.service';
import { tileClass, tileFigureClass } from './QuickStats';

export interface StorageData {
  used: number; // in bytes
  total: number; // in bytes
}

export interface StorageChartProps {
  data: StorageData;
}

/** Storage as one tile: the figure, a single bar, and what the plan allows. Warns in amber past 90 percent. */
export const StorageChart: React.FC<StorageChartProps> = ({ data }) => {
  const percent = data.total > 0 ? Math.min(100, (data.used / data.total) * 100) : 0;
  const nearlyFull = percent > 90;

  return (
    <div className={`${tileClass} col-span-2 md:col-span-1`}>
      <span className="text-sm text-ink-2">Storage</span>
      <span className={tileFigureClass}>{formatFileSize(data.used)}</span>
      <div
        className="h-1.5 overflow-hidden rounded-[3px] bg-sunk"
        role="progressbar"
        aria-label="Storage used"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={`block h-full rounded-[3px] ${nearlyFull ? 'bg-warn-text' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-ink-3">of {formatFileSize(data.total)}</span>
    </div>
  );
};
