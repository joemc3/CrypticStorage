import React, { useState } from 'react';
import {
  DocumentIcon,
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  ArchiveBoxIcon,
  EllipsisVerticalIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  TrashIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/ui';
import { motion } from 'framer-motion';
import { Fragment } from 'react';

export interface FileItemProps {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  thumbnailUrl?: string;
  viewMode?: 'grid' | 'list';
  onClick?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onPreview?: () => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
  return `${Math.floor(diffInDays / 365)} years ago`;
};

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return PhotoIcon;
  if (mimeType.startsWith('video/')) return VideoCameraIcon;
  if (mimeType.startsWith('audio/')) return MusicalNoteIcon;
  if (mimeType.includes('pdf') || mimeType.includes('document')) return DocumentTextIcon;
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return ArchiveBoxIcon;
  return DocumentIcon;
};

const getFileIconColor = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return 'text-blue-500';
  if (mimeType.startsWith('video/')) return 'text-purple-500';
  if (mimeType.startsWith('audio/')) return 'text-green-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('document')) return 'text-indigo-500';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'text-yellow-500';
  return 'text-gray-500';
};

export const FileItem: React.FC<FileItemProps> = ({
  id,
  name,
  size,
  mimeType,
  uploadedAt,
  thumbnailUrl,
  viewMode = 'grid',
  onClick,
  onDownload,
  onDelete,
  onShare,
  onPreview,
}) => {
  const [imageError, setImageError] = useState(false);
  const Icon = getFileIcon(mimeType);
  const iconColor = getFileIconColor(mimeType);
  const showThumbnail = thumbnailUrl && !imageError && mimeType.startsWith('image/');

  if (viewMode === 'list') {
    return (
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
        onClick={onClick}
      >
        {/* Icon/Thumbnail */}
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
          {showThumbnail ? (
            <img
              src={thumbnailUrl}
              alt={name}
              className="w-10 h-10 object-cover rounded"
              onError={() => setImageError(true)}
            />
          ) : (
            <Icon className={`h-8 w-8 ${iconColor}`} />
          )}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{name}</p>
        </div>

        {/* Size */}
        <div className="hidden sm:block flex-shrink-0 w-20 text-right">
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(size)}</p>
        </div>

        {/* Date */}
        <div className="hidden md:block flex-shrink-0 w-32 text-right">
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(uploadedAt)}</p>
        </div>

        {/* Actions Menu */}
        <FileActionsMenu
          onDownload={onDownload}
          onShare={onShare}
          onPreview={onPreview}
          onDelete={onDelete}
        />
      </motion.div>
    );
  }

  // Grid view
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      className="relative group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Thumbnail/Icon */}
      <div className="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
        {showThumbnail ? (
          <img
            src={thumbnailUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <Icon className={`h-16 w-16 ${iconColor}`} />
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex gap-2">
            {onPreview && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview();
                }}
                className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <EyeIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            )}
            {onDownload && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                className="p-2 bg-white dark:bg-gray-800 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ArrowDownTrayIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* File Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate mb-1" title={name}>
          {name}
        </p>
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{formatFileSize(size)}</span>
          <span>{formatDate(uploadedAt)}</span>
        </div>
      </div>

      {/* Actions Menu (Top Right) */}
      <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
        <FileActionsMenu
          onDownload={onDownload}
          onShare={onShare}
          onPreview={onPreview}
          onDelete={onDelete}
          variant="compact"
        />
      </div>
    </motion.div>
  );
};

const FileActionsMenu: React.FC<{
  onDownload?: () => void;
  onShare?: () => void;
  onPreview?: () => void;
  onDelete?: () => void;
  variant?: 'default' | 'compact';
}> = ({ onDownload, onShare, onPreview, onDelete, variant = 'default' }) => {
  return (
    <Menu as="div" className="relative">
      <Menu.Button
        className={`
          ${
            variant === 'compact'
              ? 'p-1.5 bg-white dark:bg-gray-800 opacity-0 group-hover:opacity-100'
              : 'p-2'
          }
          rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all
        `}
      >
        <EllipsisVerticalIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
          <div className="py-1">
            {onPreview && (
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreview();
                    }}
                    className={`${
                      active ? 'bg-gray-100 dark:bg-gray-700' : ''
                    } group flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300`}
                  >
                    <EyeIcon className="h-4 w-4" />
                    Preview
                  </button>
                )}
              </Menu.Item>
            )}
            {onDownload && (
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload();
                    }}
                    className={`${
                      active ? 'bg-gray-100 dark:bg-gray-700' : ''
                    } group flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300`}
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Download
                  </button>
                )}
              </Menu.Item>
            )}
            {onShare && (
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare();
                    }}
                    className={`${
                      active ? 'bg-gray-100 dark:bg-gray-700' : ''
                    } group flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300`}
                  >
                    <ShareIcon className="h-4 w-4" />
                    Share
                  </button>
                )}
              </Menu.Item>
            )}
            {onDelete && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700" />
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      className={`${
                        active ? 'bg-red-50 dark:bg-red-900/20' : ''
                      } group flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400`}
                    >
                      <TrashIcon className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </Menu.Item>
              </>
            )}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
};
