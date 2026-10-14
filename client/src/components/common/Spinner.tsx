import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  label?: string;
}

const sizeClasses = {
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-[18px] w-[18px] border-2',
  lg: 'h-6 w-6 border-2',
  xl: 'h-8 w-8 border-[3px]',
};

/** A ring, always paired with words. */
export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', color = 'text-accent', label }) => (
  <div className="flex flex-col items-center justify-center gap-3" role="status">
    <span aria-hidden="true" className={`block animate-spin rounded-full border-line-strong border-t-current ${sizeClasses[size]} ${color}`} />
    {label ? <p className="text-sm text-ink-2">{label}</p> : <span className="sr-only">Loading</span>}
  </div>
);

export const SpinnerOverlay: React.FC<{ label?: string }> = ({ label }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]">
    <div className="rounded-xl border border-line bg-surface px-6 py-5 shadow-[var(--shadow)]">
      <Spinner size="lg" label={label} />
    </div>
  </div>
);
