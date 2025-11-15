import React, { useState, useEffect } from 'react';
import {
  LinkIcon,
  ClockIcon,
  LockClosedIcon,
  ArrowDownTrayIcon,
  DocumentDuplicateIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Card, CardContent } from '../common/Card';
import { motion } from 'framer-motion';

export interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: string;
    name: string;
  } | null;
  onCreateShare: (options: ShareOptions) => Promise<ShareLink>;
  existingShares?: ShareLink[];
}

export interface ShareOptions {
  fileId: string;
  password?: string;
  expiresAt?: Date;
  maxDownloads?: number;
}

export interface ShareLink {
  id: string;
  url: string;
  createdAt: Date;
  expiresAt?: Date;
  maxDownloads?: number;
  downloadCount: number;
  password?: boolean;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  file,
  onCreateShare,
  existingShares = [],
}) => {
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [expiryDays, setExpiryDays] = useState<string>('7');
  const [useExpiry, setUseExpiry] = useState(true);
  const [maxDownloads, setMaxDownloads] = useState<string>('10');
  const [useMaxDownloads, setUseMaxDownloads] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      // Reset form when dialog closes
      setPassword('');
      setUsePassword(false);
      setExpiryDays('7');
      setUseExpiry(true);
      setMaxDownloads('10');
      setUseMaxDownloads(false);
      setCreatedLink(null);
      setCopied(false);
    }
  }, [isOpen]);

  const handleCreateShare = async () => {
    if (!file) return;

    setIsCreating(true);

    try {
      const options: ShareOptions = {
        fileId: file.id,
      };

      if (usePassword && password) {
        options.password = password;
      }

      if (useExpiry && expiryDays) {
        const days = parseInt(expiryDays);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        options.expiresAt = expiresAt;
      }

      if (useMaxDownloads && maxDownloads) {
        options.maxDownloads = parseInt(maxDownloads);
      }

      const link = await onCreateShare(options);
      setCreatedLink(link);
    } catch (error) {
      console.error('Failed to create share link:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Share: ${file?.name || ''}`}
      description="Create a secure share link for this file"
      size="lg"
    >
      <div className="space-y-6">
        {!createdLink ? (
          <>
            {/* Share Options */}
            <div className="space-y-4">
              {/* Password Protection */}
              <Card variant="bordered">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center h-6">
                      <input
                        type="checkbox"
                        id="use-password"
                        checked={usePassword}
                        onChange={(e) => setUsePassword(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="use-password"
                        className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                      >
                        <LockClosedIcon className="h-5 w-5 text-gray-500" />
                        Password Protection
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Require a password to access the file
                      </p>
                      {usePassword && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3"
                        >
                          <Input
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Expiry Date */}
              <Card variant="bordered">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center h-6">
                      <input
                        type="checkbox"
                        id="use-expiry"
                        checked={useExpiry}
                        onChange={(e) => setUseExpiry(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="use-expiry"
                        className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                      >
                        <ClockIcon className="h-5 w-5 text-gray-500" />
                        Expiration Date
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Link will expire after a certain time
                      </p>
                      {useExpiry && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3"
                        >
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              placeholder="Days"
                              value={expiryDays}
                              onChange={(e) => setExpiryDays(e.target.value)}
                              min="1"
                              max="365"
                              className="w-24"
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-400">days</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Download Limit */}
              <Card variant="bordered">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center h-6">
                      <input
                        type="checkbox"
                        id="use-max-downloads"
                        checked={useMaxDownloads}
                        onChange={(e) => setUseMaxDownloads(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="use-max-downloads"
                        className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                      >
                        <ArrowDownTrayIcon className="h-5 w-5 text-gray-500" />
                        Download Limit
                      </label>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Limit the number of times this file can be downloaded
                      </p>
                      {useMaxDownloads && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3"
                        >
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              placeholder="Max downloads"
                              value={maxDownloads}
                              onChange={(e) => setMaxDownloads(e.target.value)}
                              min="1"
                              max="1000"
                              className="w-24"
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-400">downloads</span>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Create Button */}
            <Button
              onClick={handleCreateShare}
              isLoading={isCreating}
              className="w-full"
              leftIcon={<LinkIcon className="h-5 w-5" />}
            >
              Create Share Link
            </Button>
          </>
        ) : (
          <>
            {/* Created Link */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">
                    Share link created successfully!
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Share Link
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={createdLink.url}
                    readOnly
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => handleCopyLink(createdLink.url)}
                    leftIcon={
                      copied ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                      ) : (
                        <DocumentDuplicateIcon className="h-5 w-5" />
                      )
                    }
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>

              {/* Link Details */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Created:</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {formatDate(createdLink.createdAt)}
                  </span>
                </div>
                {createdLink.expiresAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Expires:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {formatDate(createdLink.expiresAt)}
                    </span>
                  </div>
                )}
                {createdLink.maxDownloads && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Download Limit:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {createdLink.downloadCount} / {createdLink.maxDownloads}
                    </span>
                  </div>
                )}
                {createdLink.password && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Password:</span>
                    <span className="text-gray-900 dark:text-gray-100">Protected</span>
                  </div>
                )}
              </div>

              <Button variant="secondary" onClick={onClose} className="w-full">
                Done
              </Button>
            </motion.div>
          </>
        )}

        {/* Existing Shares */}
        {existingShares.length > 0 && !createdLink && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Existing Share Links
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {existingShares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="text-gray-900 dark:text-gray-100 truncate">{share.url}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                      Created {formatDate(share.createdAt)}
                      {share.expiresAt && ` • Expires ${formatDate(share.expiresAt)}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyLink(share.url)}
                    leftIcon={<DocumentDuplicateIcon className="h-4 w-4" />}
                  >
                    Copy
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
