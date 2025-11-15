import React, { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import {
  CloudArrowUpIcon,
  DocumentIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../common/Button';
import { ProgressBar } from '../common/ProgressBar';

export interface FileUploadProps {
  onUpload: (files: File[]) => Promise<void>;
  maxFiles?: number;
  maxSize?: number; // in bytes
  acceptedFileTypes?: string[];
  disabled?: boolean;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUpload,
  maxFiles = 10,
  maxSize = 100 * 1024 * 1024, // 100MB default
  acceptedFileTypes,
  disabled = false,
}) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (disabled) return;

      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const errors = rejectedFiles.map((rejection) => ({
          file: rejection.file,
          progress: 0,
          status: 'error' as const,
          error: rejection.errors[0]?.message || 'File rejected',
        }));
        setUploadingFiles((prev) => [...prev, ...errors]);
        return;
      }

      // Initialize uploading files
      const newUploadingFiles: UploadingFile[] = acceptedFiles.map((file) => ({
        file,
        progress: 0,
        status: 'uploading',
      }));

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);
      setIsUploading(true);

      try {
        // Simulate upload progress (in real app, track actual upload progress)
        const uploadPromises = acceptedFiles.map((file, index) => {
          return new Promise<void>((resolve) => {
            const interval = setInterval(() => {
              setUploadingFiles((prev) =>
                prev.map((uf) =>
                  uf.file === file && uf.progress < 100
                    ? { ...uf, progress: Math.min(uf.progress + 10, 100) }
                    : uf
                )
              );
            }, 200);

            setTimeout(() => {
              clearInterval(interval);
              setUploadingFiles((prev) =>
                prev.map((uf) =>
                  uf.file === file ? { ...uf, progress: 100, status: 'success' } : uf
                )
              );
              resolve();
            }, 2000);
          });
        });

        await Promise.all(uploadPromises);
        await onUpload(acceptedFiles);
      } catch (error: any) {
        setUploadingFiles((prev) =>
          prev.map((uf) =>
            acceptedFiles.includes(uf.file)
              ? { ...uf, status: 'error', error: error.message || 'Upload failed' }
              : uf
          )
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onUpload, disabled]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    maxFiles,
    maxSize,
    accept: acceptedFileTypes
      ? acceptedFileTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {})
      : undefined,
    disabled,
  });

  const removeFile = (fileToRemove: File) => {
    setUploadingFiles((prev) => prev.filter((uf) => uf.file !== fileToRemove));
  };

  const clearCompleted = () => {
    setUploadingFiles((prev) => prev.filter((uf) => uf.status === 'uploading'));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <motion.div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${isDragActive && !isDragReject ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : ''}
          ${isDragReject ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}
          ${
            !isDragActive && !isDragReject
              ? 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500'
              : ''
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        whileHover={!disabled ? { scale: 1.01 } : {}}
        whileTap={!disabled ? { scale: 0.99 } : {}}
      >
        <input {...getInputProps()} />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <CloudArrowUpIcon
            className={`h-16 w-16 mb-4 ${
              isDragActive ? 'text-indigo-500' : 'text-gray-400 dark:text-gray-500'
            }`}
          />

          {isDragActive ? (
            <p className="text-lg font-medium text-indigo-600 dark:text-indigo-400">
              Drop files here...
            </p>
          ) : isDragReject ? (
            <p className="text-lg font-medium text-red-600 dark:text-red-400">
              Some files will be rejected
            </p>
          ) : (
            <>
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Drag & drop files here
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">or click to browse</p>
              <Button variant="secondary" disabled={disabled}>
                Select Files
              </Button>
            </>
          )}
        </motion.div>

        {/* Upload Info */}
        <div className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          <p>
            Maximum {maxFiles} files, {formatFileSize(maxSize)} per file
          </p>
          {acceptedFileTypes && <p>Accepted: {acceptedFileTypes.join(', ')}</p>}
        </div>
      </motion.div>

      {/* Uploading Files List */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {isUploading ? 'Uploading files...' : 'Upload complete'}
            </h3>
            {!isUploading && (
              <Button variant="ghost" size="sm" onClick={clearCompleted}>
                Clear
              </Button>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {uploadingFiles.map((uploadingFile, index) => (
              <motion.div
                key={`${uploadingFile.file.name}-${index}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 100 }}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  {/* File Icon */}
                  <div className="flex-shrink-0">
                    {uploadingFile.status === 'success' ? (
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                    ) : uploadingFile.status === 'error' ? (
                      <ExclamationCircleIcon className="h-6 w-6 text-red-500" />
                    ) : (
                      <DocumentIcon className="h-6 w-6 text-gray-400" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {uploadingFile.file.name}
                      </p>
                      <button
                        onClick={() => removeFile(uploadingFile.file)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {formatFileSize(uploadingFile.file.size)}
                    </p>

                    {/* Progress Bar */}
                    {uploadingFile.status === 'uploading' && (
                      <ProgressBar
                        progress={uploadingFile.progress}
                        size="sm"
                        variant="default"
                        showPercentage={false}
                      />
                    )}

                    {/* Error Message */}
                    {uploadingFile.status === 'error' && uploadingFile.error && (
                      <p className="text-xs text-red-600 dark:text-red-400">{uploadingFile.error}</p>
                    )}

                    {/* Success Message */}
                    {uploadingFile.status === 'success' && (
                      <p className="text-xs text-green-600 dark:text-green-400">Upload complete</p>
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
