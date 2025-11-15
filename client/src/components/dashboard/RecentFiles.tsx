import React from 'react';
import {
  DocumentIcon,
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  ArchiveBoxIcon,
  ClockIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../common/Card';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { motion } from 'framer-motion';

export interface RecentFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  thumbnailUrl?: string;
}

export interface RecentFilesProps {
  files: RecentFile[];
  isLoading?: boolean;
  onFileClick?: (fileId: string) => void;
  onViewAll?: () => void;
  maxFiles?: number;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  if (mimeType.startsWith('image/')) return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
  if (mimeType.startsWith('video/')) return 'text-purple-500 bg-purple-50 dark:bg-purple-900/20';
  if (mimeType.startsWith('audio/')) return 'text-green-500 bg-green-50 dark:bg-green-900/20';
  if (mimeType.includes('pdf')) return 'text-red-500 bg-red-50 dark:bg-red-900/20';
  if (mimeType.includes('document')) return 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20';
  if (mimeType.includes('zip') || mimeType.includes('compressed'))
    return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
  return 'text-gray-500 bg-gray-50 dark:bg-gray-900/20';
};

export const RecentFiles: React.FC<RecentFilesProps> = ({
  files,
  isLoading = false,
  onFileClick,
  onViewAll,
  maxFiles = 5,
}) => {
  const displayFiles = files.slice(0, maxFiles);

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClockIcon className="h-5 w-5 text-gray-500" />
              Recent Files
            </CardTitle>
            <CardDescription>Your recently uploaded files</CardDescription>
          </div>
          {onViewAll && files.length > maxFiles && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewAll}
              rightIcon={<ArrowRightIcon className="h-4 w-4" />}
            >
              View All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" label="Loading files..." />
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="text-center py-8">
            <DocumentIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No files uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayFiles.map((file, index) => {
              const Icon = getFileIcon(file.mimeType);
              const iconColorClass = getFileIconColor(file.mimeType);

              return (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onFileClick?.(file.id)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer group"
                >
                  {/* Icon/Thumbnail */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${iconColorClass} flex items-center justify-center`}>
                    {file.thumbnailUrl && file.mimeType.startsWith('image/') ? (
                      <img
                        src={file.thumbnailUrl}
                        alt={file.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{formatFileSize(file.size)}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(file.uploadedAt)}</span>
                    </div>
                  </div>

                  {/* Arrow Icon */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRightIcon className="h-4 w-4 text-gray-400" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
