import React, { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { ArrowUpTrayIcon, CheckIcon, ExclamationTriangleIcon, LockClosedIcon } from '@heroicons/react/24/outline';
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

  const stateLine = (u: UploadProgress) =>
    u.status === 'error' ? u.error ?? 'Upload failed' : u.status === 'complete' ? 'Encrypted and stored' : `${Math.round(u.progress)}%`;

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
          isDragReject
            ? 'border-danger bg-danger-soft'
            : isDragActive
              ? 'border-accent bg-accent-soft'
              : 'border-line-strong bg-surface-2 hover:border-accent'
        } ${disabled || isUploading ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-3" aria-hidden="true">
          <ArrowUpTrayIcon className="h-6 w-6" />
        </div>
        {isDragActive ? (
          <p className="font-semibold text-accent-text">Drop to encrypt and upload</p>
        ) : (
          <>
            <p className="font-semibold text-ink">Drop files here, or click to choose them</p>
            <Button variant="secondary" size="sm" disabled={disabled || isUploading}>
              Select files
            </Button>
          </>
        )}
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] leading-[18px] text-ink-3">
          <LockClosedIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Encrypted in your browser before upload. Up to {maxFiles} files, {formatFileSize(maxSize)} each.
        </p>
      </div>

      {rejected.length > 0 && (
        <ul className="flex flex-col gap-1" role="list">
          {rejected.map((r) => (
            <li key={r.name} className="flex items-center gap-2 text-sm text-danger-text">
              <ExclamationTriangleIcon className="h-4 w-4 flex-none" aria-hidden="true" /> {r.name}: {r.reason}
            </li>
          ))}
        </ul>
      )}

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-2" role="list" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.fileId} className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink">{u.fileName}</span>
                <span className={`flex flex-none items-center gap-1.5 ${u.status === 'error' ? 'text-danger-text' : 'text-ink-3'}`}>
                  {u.status === 'complete' && <CheckIcon className="h-4 w-4 text-accent-text" aria-hidden="true" />}
                  {u.status === 'error' && <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />}
                  {stateLine(u)}
                </span>
              </div>
              {u.status !== 'error' && u.status !== 'complete' && (
                <ProgressBar progress={u.progress} showPercentage={false} label={u.status === 'encrypting' ? 'Encrypting…' : 'Uploading…'} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
