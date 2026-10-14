import React from 'react';
import { Spinner } from '../common/Spinner';

export interface StatCard {
  id: string;
  label: string;
  value: string | number;
  /** The quiet line under the figure, for example "in 4 folders". */
  detail?: string;
  /** Kept so existing callers still type-check; the design draws no icons on figures. */
  icon?: React.ComponentType<{ className?: string }>;
  color?: string;
  change?: number;
  changeLabel?: string;
}

export interface QuickStatsProps {
  stats?: StatCard[];
  isLoading?: boolean;
  variant?: 'default' | 'compact';
  /** Extra tiles drawn in the same row, for example the storage tile. */
  children?: React.ReactNode;
}

export const tileClass = 'flex flex-col gap-2 rounded-xl border border-line bg-surface p-4';
export const tileFigureClass = 'font-sans text-[26px] font-medium leading-[30px] tracking-[-0.01em] text-ink [font-variant-numeric:tabular-nums]';

const defaultStats: StatCard[] = [
  { id: 'items', label: 'Items', value: '0' },
  { id: 'shared', label: 'Shared with me', value: '0' },
];

/** The figures of the safe as tiles: a label, one number, one quiet line. */
export const QuickStats: React.FC<QuickStatsProps> = ({ stats = defaultStats, isLoading = false, children }) => {
  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-line bg-surface">
        <Spinner size="md" label="Loading" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.id} className={tileClass}>
          <span className="text-sm text-ink-2">{stat.label}</span>
          <span className={tileFigureClass}>{stat.value}</span>
          {stat.detail && <span className="text-xs text-ink-3">{stat.detail}</span>}
        </div>
      ))}
      {children}
    </div>
  );
};

// Helper hook for creating stat cards
export const useQuickStats = (data: { totalFiles?: number; sharedFiles?: number }): StatCard[] => {
  const stats: StatCard[] = [];
  if (data.totalFiles !== undefined) {
    stats.push({ id: 'items', label: 'Items', value: data.totalFiles.toLocaleString() });
  }
  if (data.sharedFiles !== undefined) {
    stats.push({ id: 'shared', label: 'Shared with me', value: data.sharedFiles.toLocaleString() });
  }
  return stats;
};
