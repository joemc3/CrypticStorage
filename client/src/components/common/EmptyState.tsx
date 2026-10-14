import React from 'react';
import { FolderIcon } from '@heroicons/react/24/outline';

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: React.ReactNode;
  /** Defaults to a folder. */
  icon?: React.ReactNode;
}

/** A dashed ring with one icon, one bold line, one small line and at most one action. */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, body, action, icon }) => (
  <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-3" aria-hidden="true">
      {icon ?? <FolderIcon className="h-6 w-6" />}
    </div>
    <p className="font-semibold text-ink">{title}</p>
    {body && <p className="text-sm text-ink-3">{body}</p>}
    {action}
  </div>
);
