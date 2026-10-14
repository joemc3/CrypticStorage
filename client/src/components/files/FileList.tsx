import React, { useMemo, useState } from 'react';
import { FolderIcon, MagnifyingGlassIcon, TrashIcon } from '@heroicons/react/24/outline';
import { FileActionsMenu, FileItem, FileItemProps } from './FileItem';
import { EmptyState } from '../common/EmptyState';
import { ListRow, RowList } from '../common/ListRow';
import { Spinner } from '../common/Spinner';

export interface FolderRowItem {
  id: string;
  name: string;
  /** Shown as the row meta when known, for example "3 items". */
  meta?: string;
  /** Handoff marker for a folder a rule names directly (decision 5: children do not repeat it). */
  marker?: React.ReactNode;
  /** Given only when the folder has rules. */
  onRules?: () => void;
}

export interface FileListProps {
  files: FileItemProps[];
  folders?: FolderRowItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (fileId: string) => void;
  onFileClick?: (fileId: string) => void;
  onFileDownload?: (fileId: string) => void;
  onFileDelete?: (fileId: string) => void;
  onFileShare?: (fileId: string) => void;
  onFolderOpen?: (folderId: string) => void;
  onFolderDelete?: (folderId: string) => void;
  onFileHandoff?: (fileId: string) => void;
  onFolderHandoff?: (folderId: string) => void;
}

type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';

const sortLabels: Record<SortKey, string> = {
  'date-desc': 'Newest first',
  'date-asc': 'Oldest first',
  'name-asc': 'Name, A to Z',
  'name-desc': 'Name, Z to A',
  'size-desc': 'Largest first',
  'size-asc': 'Smallest first',
};

const control =
  'h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const FileList: React.FC<FileListProps> = ({
  files,
  folders = [],
  isLoading = false,
  emptyMessage = 'No files found',
  selectedIds,
  onToggleSelect,
  onFileClick,
  onFileDownload,
  onFileDelete,
  onFileShare,
  onFolderOpen,
  onFolderDelete,
  onFileHandoff,
  onFolderHandoff,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');

  const visibleFolders = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, searchQuery]);

  const visibleFiles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const result = files.filter((f) => f.name.toLowerCase().includes(q));
    const [field, order] = sort.split('-') as ['date' | 'name' | 'size', 'asc' | 'desc'];
    result.sort((a, b) => {
      const comparison = field === 'name' ? a.name.localeCompare(b.name) : field === 'size' ? a.size - b.size : new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      return order === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [files, searchQuery, sort]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="sm" label="Decrypting names…" />
      </div>
    );
  }

  const total = visibleFolders.length + visibleFiles.length;
  const nothingAtAll = files.length === 0 && folders.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {!nothingAtAll && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search files"
              placeholder="Search files"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${control} w-full pl-10 placeholder:text-ink-3`}
            />
          </div>
          <select aria-label="Sort files" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={control}>
            {(Object.keys(sortLabels) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {sortLabels[key]}
              </option>
            ))}
          </select>
        </div>
      )}

      {total === 0 ? (
        <EmptyState title={nothingAtAll ? emptyMessage : `Nothing matches "${searchQuery}".`} body={nothingAtAll ? 'Files are encrypted before they leave this browser.' : undefined} />
      ) : (
        <>
          <RowList columns>
            {visibleFolders.map((folder) => (
              <ListRow
                key={folder.id}
                tone="folder"
                icon={<FolderIcon className="h-5 w-5" />}
                title={folder.name}
                meta={folder.meta ?? 'Folder'}
                size=""
                date=""
                markers={folder.marker}
                onClick={() => onFolderOpen?.(folder.id)}
                actions={
                  <>
                    {(onFolderHandoff || folder.onRules) && (
                      <FileActionsMenu name={folder.name} onHandoff={onFolderHandoff && (() => onFolderHandoff(folder.id))} onRules={folder.onRules} />
                    )}
                    {onFolderDelete && (
                    <button
                      type="button"
                      onClick={() => onFolderDelete(folder.id)}
                      aria-label={`Delete folder ${folder.name}`}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-3 hover:bg-danger-soft hover:text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <TrashIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                    )}
                  </>
                }
              />
            ))}
            {visibleFiles.map((file) => (
              <FileItem
                key={file.id}
                {...file}
                selected={selectedIds?.has(file.id) ?? false}
                onToggleSelect={onToggleSelect ? () => onToggleSelect(file.id) : undefined}
                onClick={() => onFileClick?.(file.id)}
                onPreview={() => onFileClick?.(file.id)}
                onDownload={() => onFileDownload?.(file.id)}
                onDelete={() => onFileDelete?.(file.id)}
                onShare={() => onFileShare?.(file.id)}
                onHandoff={onFileHandoff ? () => onFileHandoff(file.id) : undefined}
              />
            ))}
          </RowList>
          <p className="text-sm text-ink-3">
            {visibleFiles.length} {visibleFiles.length === 1 ? 'file' : 'files'}
            {visibleFolders.length > 0 && `, ${visibleFolders.length} ${visibleFolders.length === 1 ? 'folder' : 'folders'}`}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </>
      )}
    </div>
  );
};
