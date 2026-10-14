import React from 'react';
import { DocumentIcon } from '@heroicons/react/24/outline';
import { Spinner } from '../common/Spinner';
import { formatFileSize } from '../../services/file.service';

export interface RecentFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface RecentFilesProps {
  files: RecentFile[];
  isLoading?: boolean;
  onFileClick?: (fileId: string) => void;
  onViewAll?: () => void;
  maxFiles?: number;
}

const formatDate = (dateString: string): string =>
  new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** The latest items as rows: name, size, modified. The icon only says file or folder. */
export const RecentFiles: React.FC<RecentFilesProps> = ({ files, isLoading = false, onFileClick, onViewAll, maxFiles = 5 }) => {
  const displayFiles = files.slice(0, maxFiles);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-base font-semibold leading-[22px] text-ink">Recent</h2>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-sm text-accent-text hover:underline">
            All files
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="md" label="Loading files" />
        </div>
      ) : displayFiles.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-ink-2">Nothing here yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {displayFiles.map((file) => (
            <li key={file.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                onClick={() => onFileClick?.(file.id)}
                className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                  <DocumentIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate font-medium text-ink">{file.name}</span>
                  <span className="flex flex-wrap gap-x-3 text-[13px] leading-[18px] text-ink-3">
                    <span>{formatFileSize(file.size)}</span>
                    <span>{formatDate(file.uploadedAt)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
