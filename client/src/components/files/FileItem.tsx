import React, { Fragment } from 'react';
import {
  DocumentIcon,
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  ArchiveBoxIcon,
  EllipsisHorizontalIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  TrashIcon,
  EyeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { ListRow } from '../common/ListRow';

export interface FileItemProps {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  /** Slot for the share marker. Nothing is drawn until the file listing carries share data. */
  shareMarker?: React.ReactNode;
  /** Slot for the handoff marker. Nothing is drawn until the handoff stage supplies one. */
  handoffMarker?: React.ReactNode;
  /** Optional checkbox state. The checkbox is drawn only when `onToggleSelect` is given. */
  selected?: boolean;
  onToggleSelect?: () => void;
  onClick?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onPreview?: () => void;
  /** "Hand off…": open the rule sheet for this item. */
  onHandoff?: () => void;
  /** "Rules": open the rules on this item. Given only when it has any. */
  onRules?: () => void;
}

export const formatFileSize = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Math.round((bytes / 1024 ** i) * 10) / 10} ${units[i]}`;
};

/** "12 Oct", with the year when it is not this one. */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return PhotoIcon;
  if (mimeType.startsWith('video/')) return VideoCameraIcon;
  if (mimeType.startsWith('audio/')) return MusicalNoteIcon;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.startsWith('text/')) return DocumentTextIcon;
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return ArchiveBoxIcon;
  return DocumentIcon;
};

export const FileItem: React.FC<FileItemProps> = ({
  name,
  size,
  mimeType,
  uploadedAt,
  shareMarker,
  handoffMarker,
  selected = false,
  onToggleSelect,
  onClick,
  onDownload,
  onDelete,
  onShare,
  onPreview,
  onHandoff,
  onRules,
}) => {
  const Icon = getFileIcon(mimeType);
  const markers =
    shareMarker || handoffMarker ? (
      <>
        {handoffMarker}
        {shareMarker}
      </>
    ) : undefined;

  return (
    <ListRow
      icon={<Icon className="h-5 w-5" />}
      title={name}
      size={formatFileSize(size)}
      date={formatDate(uploadedAt)}
      markers={markers}
      selected={selected}
      onClick={onClick}
      leading={
        onToggleSelect ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${name}`}
            className="h-4 w-4 flex-none rounded border-line-strong accent-[var(--accent)]"
          />
        ) : undefined
      }
      actions={<FileActionsMenu name={name} onDownload={onDownload} onShare={onShare} onPreview={onPreview} onHandoff={onHandoff} onRules={onRules} onDelete={onDelete} />}
    />
  );
};

const item = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-[15px] font-medium';

export const FileActionsMenu: React.FC<{
  name: string;
  onDownload?: () => void;
  onShare?: () => void;
  onPreview?: () => void;
  onDelete?: () => void;
  onHandoff?: () => void;
  onRules?: () => void;
}> = ({ name, onDownload, onShare, onPreview, onDelete, onHandoff, onRules }) => {
  const entries: { label: string; icon: React.ReactNode; run?: () => void; danger?: boolean }[] = [
    { label: 'Preview', icon: <EyeIcon className="h-5 w-5" />, run: onPreview },
    { label: 'Download', icon: <ArrowDownTrayIcon className="h-5 w-5" />, run: onDownload },
    { label: 'Share', icon: <ShareIcon className="h-5 w-5" />, run: onShare },
    { label: 'Hand off…', icon: <ClockIcon className="h-5 w-5" />, run: onHandoff },
    { label: 'Rules', icon: <ClockIcon className="h-5 w-5" />, run: onRules },
    { label: 'Delete', icon: <TrashIcon className="h-5 w-5" />, run: onDelete, danger: true },
  ].filter((e) => e.run);
  if (entries.length === 0) return null;

  return (
    <Menu as="div" className="relative">
      <Menu.Button
        aria-label={`Actions for ${name}`}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <EllipsisHorizontalIcon className="h-5 w-5" aria-hidden="true" />
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <Menu.Items className="absolute right-0 z-10 mt-1 w-52 origin-top-right overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg focus:outline-none">
          {entries.map((e) => (
            <Menu.Item key={e.label}>
              {({ active }) => (
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    e.run?.();
                  }}
                  className={`${item} ${active ? (e.danger ? 'bg-danger-soft' : 'bg-surface-2') : ''} ${e.danger ? 'text-danger-text' : 'text-ink'}`}
                >
                  {e.icon}
                  {e.label}
                </button>
              )}
            </Menu.Item>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  );
};
