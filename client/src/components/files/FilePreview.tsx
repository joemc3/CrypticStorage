import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from '@heroicons/react/24/outline';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { motion, AnimatePresence } from 'framer-motion';

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

  useEffect(() => {
    if (!file || !isOpen) {
      setPreviewUrl(null);
      setError(null);
      setZoom(1);
      return;
    }

    const loadPreview = async () => {
      setIsDecrypting(true);
      setError(null);

      try {
        if (file.url) {
          setPreviewUrl(file.url);
        } else if (decryptFile) {
          const decryptedUrl = await decryptFile(file.id);
          setPreviewUrl(decryptedUrl);
        } else {
          setError('No preview available');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load preview');
      } finally {
        setIsDecrypting(false);
      }
    };

    loadPreview();

    return () => {
      // Cleanup blob URLs
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file, isOpen, decryptFile]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const renderPreview = () => {
    if (isDecrypting || isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <Spinner size="lg" label="Decrypting file..." />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      );
    }

    if (!file || !previewUrl) {
      return (
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500 dark:text-gray-400">No preview available</p>
        </div>
      );
    }

    // Image preview
    if (file.mimeType.startsWith('image/')) {
      return (
        <div className="relative overflow-auto max-h-[70vh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg">
          <motion.img
            src={previewUrl}
            alt={file.name}
            className="max-w-full h-auto"
            style={{ transform: `scale(${zoom})` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          />
        </div>
      );
    }

    // Video preview
    if (file.mimeType.startsWith('video/')) {
      return (
        <div className="flex items-center justify-center">
          <video
            src={previewUrl}
            controls
            className="max-w-full max-h-[70vh] rounded-lg"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    // Audio preview
    if (file.mimeType.startsWith('audio/')) {
      return (
        <div className="flex items-center justify-center p-8">
          <audio src={previewUrl} controls className="w-full max-w-md">
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    }

    // PDF preview
    if (file.mimeType === 'application/pdf') {
      return (
        <iframe
          src={previewUrl}
          className="w-full h-[70vh] rounded-lg"
          title={file.name}
        />
      );
    }

    // Text preview
    if (file.mimeType.startsWith('text/')) {
      return (
        <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg max-h-[70vh] overflow-auto">
          <iframe src={previewUrl} className="w-full h-full min-h-[500px]" title={file.name} />
        </div>
      );
    }

    // Fallback
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Preview not available for this file type
          </p>
          {onDownload && (
            <Button onClick={onDownload} leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}>
              Download to view
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {file?.name || 'Preview'}
            </h3>
            {file && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatFileSize(file.size)} • {file.mimeType}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="flex-shrink-0 ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Preview Content */}
        <div className="relative">
          {renderPreview()}

          {/* Navigation Arrows */}
          {onNavigate && file && (
            <>
              <button
                onClick={() => onNavigate('prev')}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeftIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
              </button>
              <button
                onClick={() => onNavigate('next')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronRightIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
              </button>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          {/* Zoom controls for images */}
          {file?.mimeType.startsWith('image/') && !isDecrypting && !error && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.5}>
                <MagnifyingGlassMinusIcon className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[4rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={zoom >= 3}>
                <MagnifyingGlassPlusIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleResetZoom}>
                Reset
              </Button>
            </div>
          )}

          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {onShare && (
              <Button
                variant="secondary"
                onClick={onShare}
                leftIcon={<ShareIcon className="h-4 w-4" />}
              >
                Share
              </Button>
            )}
            {onDownload && (
              <Button
                onClick={onDownload}
                leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
              >
                Download
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
