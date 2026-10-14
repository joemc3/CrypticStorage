/**
 * CrypticStorage - Shared Page
 * Opens an anonymous share link. The decryption key lives in the URL fragment
 * and is never sent to the server.
 */

import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ArrowDownTrayIcon, DocumentIcon, LockClosedIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { PublicLayout } from '../layouts/PublicLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Spinner } from '../components/common/Spinner';
import { ProgressBar } from '../components/common/ProgressBar';
import ShareService, { type PublicSharedFile } from '../services/share.service';
import type { Bytes } from '../services/crypto.service';
import { formatFileSize, saveBlob } from '../services/file.service';

export const SharedPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const [keyBytes, setKeyBytes] = useState<Bytes | null>(null);
  const [file, setFile] = useState<PublicSharedFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [progress, setProgress] = useState<{ percent: number; stage: 'downloading' | 'decrypting' } | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      const key = ShareService.keyFromFragment(location.hash);
      if (!token) return setError('Invalid link');
      if (!key) {
        setError('This link is incomplete: the part after “#” holds the decryption key and must be copied in full.');
        setIsLoading(false);
        return;
      }
      setKeyBytes(key);
      try {
        const shared = await ShareService.openPublicShare(token, key);
        setFile(shared);
        setNeedsPassword(shared.passwordProtected);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open this link');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [token, location.hash]);

  const download = async () => {
    if (!file || !keyBytes) return;
    setPasswordError(undefined);
    setProgress({ percent: 0, stage: 'downloading' });
    try {
      const blob = await ShareService.downloadPublicShare(file, keyBytes, needsPassword ? password : undefined, (percent, stage) => setProgress({ percent, stage }));
      saveBlob(blob, file.name);
      setProgress(null);
    } catch (err) {
      setProgress(null);
      const message = err instanceof Error ? err.message : 'Download failed';
      if (message === 'PASSWORD_REQUIRED' || /password/i.test(message)) setPasswordError(message === 'PASSWORD_REQUIRED' ? 'Enter the password for this link' : message);
      else setError(message);
    }
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" label="Opening secure link…" />
        </div>
      </PublicLayout>
    );
  }

  if (error || !file) {
    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto">
          <Card variant="bordered" padding="lg">
            <div className="text-center py-12">
              <DocumentIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Link unavailable</h2>
              <p className="text-gray-600 dark:text-gray-400">{error ?? 'This shared file does not exist or has expired.'}</p>
            </div>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-2xl mx-auto">
        <Card variant="bordered" padding="lg">
          <div className="text-center">
            <DocumentIcon className="h-20 w-20 text-indigo-600 dark:text-indigo-400 mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 break-words">{file.name}</h1>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-6">
              <span>{formatFileSize(file.size)}</span>
              <span>Shared by {file.sharedBy}</span>
              {file.expiresAt && <span>Expires {new Date(file.expiresAt).toLocaleDateString()}</span>}
              {file.downloadsRemaining !== undefined && <span>{file.downloadsRemaining} download(s) left</span>}
            </div>

            {needsPassword && (
              <div className="max-w-xs mx-auto mb-6">
                <Input
                  type="password"
                  label="Link password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={passwordError}
                  leftIcon={<LockClosedIcon className="h-5 w-5" />}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void download();
                  }}
                />
              </div>
            )}

            {progress ? (
              <div className="max-w-sm mx-auto">
                <ProgressBar progress={progress.percent} label={progress.stage === 'downloading' ? 'Downloading…' : 'Decrypting in your browser…'} />
              </div>
            ) : (
              <Button onClick={() => void download()} size="lg" leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />} disabled={needsPassword && !password}>
                Download and decrypt
              </Button>
            )}

            <p className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 text-xs text-gray-500">
              <ShieldCheckIcon className="h-4 w-4" />
              Decrypted on your device. The server only stores ciphertext.
            </p>
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default SharedPage;
