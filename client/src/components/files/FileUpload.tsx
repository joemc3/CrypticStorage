import React, { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { CloudArrowUpIcon, DocumentIcon, CheckCircleIcon, ExclamationCircleIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../common/Button';
import { ProgressBar } from '../common/ProgressBar';
import type { UploadProgress } from '../../stores/file.store';

export interface FileUploadProps {
  onUpload: (files: File[]) => Promise<unknown>;
  /** Live progress entries from the file store. */
  uploads?: UploadProgress[];
  maxFiles?: number;
  maxSize?: number;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${units[i]}`;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUpload, uploads = [], maxFiles = 20, maxSize = 5 * 1024 ** 3, disabled = false }) => {
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    async (accepted: File[], rejections: FileRejection[]) => {
      if (disabled) return;
      setRejected(rejections.map((r) => ({ name: r.file.name, reason: r.errors[0]?.message ?? 'Rejected' })));
      if (accepted.length === 0) return;
      setIsUploading(true);
      try {
        await onUpload(accepted);
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload, disabled]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({ onDrop, maxFiles, maxSize, disabled: disabled || isUploading });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
          isDragActive && !isDragReject ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : ''
        } ${isDragReject ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''} ${
          !isDragActive && !isDragReject ? 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500' : ''
        } ${disabled || isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center">
          <CloudArrowUpIcon className={`h-16 w-16 mb-4 ${isDragActive ? 'text-indigo-500' : 'text-gray-400 dark:text-gray-500'}`} />
          {isDragActive ? (
            <p className="text-lg font-medium text-indigo-600 dark:text-indigo-400">Drop to encrypt and upload</p>
          ) : (
            <>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Drag &amp; drop files here</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">or click to browse</p>
              <Button variant="secondary" disabled={disabled || isUploading}>
                Select files
              </Button>
            </>
          )}
        </div>
        <p className="mt-6 flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <LockClosedIcon className="h-3.5 w-3.5" />
          Encrypted in your browser before upload. Up to {maxFiles} files, {formatFileSize(maxSize)} each.
        </p>
      </div>

      {rejected.length > 0 && (
        <div className="space-y-1">
          {rejected.map((r) => (
            <p key={r.name} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <ExclamationCircleIcon className="h-4 w-4" /> {r.name}: {r.reason}
            </p>
          ))}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {uploads.map((u) => (
              <motion.div
                key={u.fileId}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 100 }}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    {u.status === 'complete' ? (
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                    ) : u.status === 'error' ? (
                      <ExclamationCircleIcon className="h-6 w-6 text-red-500" />
                    ) : (
                      <DocumentIcon className="h-6 w-6 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.fileName}</p>
                    {u.status === 'error' ? (
                      <p className="text-xs text-red-600 dark:text-red-400">{u.error ?? 'Upload failed'}</p>
                    ) : u.status === 'complete' ? (
                      <p className="text-xs text-green-600 dark:text-green-400">Encrypted and stored</p>
                    ) : (
                      <ProgressBar progress={u.progress} size="sm" label={u.status === 'encrypting' ? 'Encrypting…' : 'Uploading…'} />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
