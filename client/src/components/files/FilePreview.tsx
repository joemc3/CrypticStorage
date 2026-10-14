import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { formatFileSize } from './FileItem';
import { motion } from 'framer-motion';

export interface FilePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url?: string;
  } | null;
  onDownload?: () => void;
  onShare?: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
  isLoading?: boolean;
  decryptFile?: (fileId: string) => Promise<string>; // Returns decrypted blob URL
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  isOpen,
  onClose,
  file,
  onDownload,
  onShare,
  onNavigate,
  isLoading = false,
  decryptFile,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [text, setText] = useState<string | null>(null);

  const fileId = file?.id;
  const fileUrl = file?.url;

  useEffect(() => {
    if (!fileId || !isOpen) {
      setPreviewUrl(null);
      setError(null);
      setZoom(1);
      return;
    }

    let cancelled = false;
    let blobUrl: string | null = null;

    const loadPreview = async () => {
      setIsDecrypting(true);
      setError(null);

      try {
        if (fileUrl) {
          setPreviewUrl(fileUrl);
        } else if (decryptFile) {
          const decryptedUrl = await decryptFile(fileId);
          blobUrl = decryptedUrl;
          if (cancelled) {
            if (decryptedUrl.startsWith('blob:')) URL.revokeObjectURL(decryptedUrl);
            return;
          }
          setPreviewUrl(decryptedUrl);
        } else {
          setError('No preview available');
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load preview');
      } finally {
        if (!cancelled) setIsDecrypting(false);
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
      // The decrypted copy goes away with the preview.
      if (blobUrl && blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
    };
  }, [fileId, fileUrl, isOpen, decryptFile]);

  // Text files are read from the decrypted blob and drawn in the page, so they take the page's type and theme.
  useEffect(() => {
    setText(null);
    if (!previewUrl || !file?.mimeType.startsWith('text/')) return;
    let cancelled = false;
    fetch(previewUrl)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load preview');
      });
    return () => {
      cancelled = true;
    };
  }, [previewUrl, file?.mimeType]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const center = 'flex min-h-[240px] items-center justify-center';

  const renderPreview = () => {
    if (isDecrypting || isLoading) {
      return (
        <div className={center}>
          <Spinner size="sm" label="Decrypting…" />
        </div>
      );
    }

    if (error) {
      return (
        <div className={center}>
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-danger-text">{error}</p>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      );
    }

    if (!file || !previewUrl) {
      return (
        <div className={center}>
          <p className="text-ink-3">No preview available</p>
        </div>
      );
    }

    if (file.mimeType.startsWith('image/')) {
      return (
        <div className="relative flex max-h-[60vh] items-center justify-center overflow-auto rounded-[10px] border border-line bg-surface">
          <motion.img
            src={previewUrl}
            alt={file.name}
            className="h-auto max-w-full"
            style={{ transform: `scale(${zoom})` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          />
        </div>
      );
    }

    if (file.mimeType.startsWith('video/')) {
      return (
        <div className={center}>
          <video src={previewUrl} controls className="max-h-[60vh] max-w-full rounded-[10px]">
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (file.mimeType.startsWith('audio/')) {
      return (
        <div className={`${center} p-8`}>
          <audio src={previewUrl} controls className="w-full max-w-md">
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    }

    if (file.mimeType === 'application/pdf') {
      return <iframe src={previewUrl} className="h-[60vh] w-full rounded-[10px] border border-line bg-surface" title={file.name} />;
    }

    if (file.mimeType.startsWith('text/')) {
      return text === null ? (
        <div className={center}>
          <Spinner size="sm" label="Decrypting…" />
        </div>
      ) : (
        <pre className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-[10px] border border-line bg-surface p-5 font-mono text-[13px] leading-[21px] text-ink">{text}</pre>
      );
    }

    return (
      <div className={center}>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-ink-2">Preview not available for this file type</p>
          {onDownload && (
            <Button onClick={onDownload} leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}>
              Download to view
            </Button>
          )}
        </div>
      </div>
    );
  };

  const iconButton =
    'flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40';
  const navButton =
    'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-sm hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const isImage = file?.mimeType.startsWith('image/') && !isDecrypting && !error;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
      <div className="-m-6 flex flex-col text-ink">
        <div className="flex items-center justify-between gap-3 border-b border-line py-3 pl-5 pr-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-base font-semibold leading-[22px] text-ink">{file?.name || 'Preview'}</h2>
            {file && (
              <p className="text-xs text-ink-3">
                {formatFileSize(file.size)} · {file.mimeType}
              </p>
            )}
          </div>
          <div className="flex flex-none items-center gap-1">
            {onShare && (
              <button type="button" onClick={onShare} aria-label={`Share ${file?.name ?? 'file'}`} className={iconButton}>
                <ShareIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            {onDownload && (
              <button type="button" onClick={onDownload} aria-label={`Download ${file?.name ?? 'file'}`} className={iconButton}>
                <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close preview" className={iconButton}>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 bg-surface-2 p-5">
          <div className="relative">
            {renderPreview()}
            {onNavigate && file && (
              <>
                <button type="button" onClick={() => onNavigate('prev')} aria-label="Previous file" className={`${navButton} left-2`}>
                  <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onNavigate('next')} aria-label="Next file" className={`${navButton} right-2`}>
                  <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-ink-3">
              <LockClosedIcon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
              Decrypted in this browser. Closing the preview clears it from memory.
            </p>
            {isImage && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={handleZoomOut} disabled={zoom <= 0.5} aria-label="Zoom out" className={iconButton}>
                  <MagnifyingGlassMinusIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <span className="min-w-[3.5rem] text-center text-sm tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={handleZoomIn} disabled={zoom >= 3} aria-label="Zoom in" className={iconButton}>
                  <MagnifyingGlassPlusIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                <Button variant="quiet" size="sm" onClick={handleResetZoom}>
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
