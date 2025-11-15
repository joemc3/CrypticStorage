/**
 * CrypticStorage - Shared Page
 * Public page for accessing shared files (no authentication required)
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PublicLayout } from '../layouts/PublicLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { ArrowDownTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';

interface SharedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  sharedBy: string;
  expiresAt?: string;
}

export const SharedPage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [file, setFile] = useState<SharedFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadSharedFile();
  }, [shareId]);

  const loadSharedFile = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // TODO: Implement actual API call to get shared file metadata
      // For now, using mock data
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock data
      setFile({
        id: shareId || '',
        name: 'Example Document.pdf',
        size: 1024 * 1024 * 2.5, // 2.5 MB
        mimeType: 'application/pdf',
        sharedBy: 'user@example.com',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (err: any) {
      console.error('Failed to load shared file:', err);
      setError(err.message || 'Failed to load shared file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!file) return;

    try {
      setDownloading(true);

      // TODO: Implement actual download with decryption
      // For now, just simulate download
      await new Promise((resolve) => setTimeout(resolve, 2000));

      alert('File download would start here');
    } catch (err: any) {
      console.error('Download failed:', err);
      alert('Download failed: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" />
        </div>
      </PublicLayout>
    );
  }

  if (error || !file) {
    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto">
          <Card>
            <div className="text-center py-12">
              <DocumentIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                File Not Found
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {error || 'This shared file does not exist or has expired.'}
              </p>
            </div>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="text-center">
            <div className="mb-6">
              <DocumentIcon className="h-20 w-20 text-indigo-600 dark:text-indigo-400 mx-auto" />
            </div>

            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {file.name}
            </h1>

            <div className="flex items-center justify-center gap-6 text-sm text-gray-600 dark:text-gray-400 mb-8">
              <div>
                <span className="font-medium">Size:</span> {formatFileSize(file.size)}
              </div>
              <div>
                <span className="font-medium">Shared by:</span> {file.sharedBy}
              </div>
            </div>

            {file.expiresAt && (
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  This link expires on {new Date(file.expiresAt).toLocaleDateString()}
                </p>
              </div>
            )}

            <Button
              onClick={handleDownload}
              isLoading={downloading}
              size="lg"
              leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
            >
              Download File
            </Button>

            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Files are encrypted end-to-end. Only you and the sender can access this file.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
};
