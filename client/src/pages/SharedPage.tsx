/**
 * CrypticStorage - Shared Page
 * Opens an anonymous share link. The decryption key lives in the URL fragment
 * and is never sent to the server.
 */

import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ArrowDownTrayIcon, ClockIcon, DocumentIcon, LinkSlashIcon } from '@heroicons/react/24/outline';
import { PublicLayout } from '../layouts/PublicLayout';
import { Spinner } from '../components/common/Spinner';
import { ProgressBar } from '../components/common/ProgressBar';
import ShareService, { type PublicSharedFile } from '../services/share.service';
import type { Bytes } from '../services/crypto.service';
import { formatFileSize, saveBlob } from '../services/file.service';

const title = 'font-sans text-2xl font-semibold leading-[30px] tracking-tight text-ink md:text-[28px] md:leading-[34px]';
const cap = 'font-mono text-xs font-medium uppercase leading-4 tracking-[0.04em] text-ink-3';
const primary =
  'inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 font-sans text-[15px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-[0.42] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** One line for each way a link can be gone, matched on the server's message. */
function goneLine(message: string): string | null {
  if (/revoked/i.test(message)) return 'This link was revoked by its owner.';
  if (/download limit/i.test(message)) return 'This link has reached its download limit.';
  if (/expired/i.test(message)) return 'This link has expired.';
  return null;
}

export const SharedPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const [keyBytes, setKeyBytes] = useState<Bytes | null>(null);
  const [file, setFile] = useState<PublicSharedFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [opened, setOpened] = useState(false);
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
      setOpened(true);
      setOpened(true);
    } catch (err) {
      setProgress(null);
      const message = err instanceof Error ? err.message : 'Download failed';
      if (message === 'PASSWORD_REQUIRED' || /password/i.test(message)) setPasswordError(message === 'PASSWORD_REQUIRED' ? 'Enter the password for this link' : message);
      else setError(message);
    }
  };

  const action = <span className="pr-2 font-sans text-[13px] text-ink-3">No account needed</span>;

  if (isLoading) {
    return (
      <PublicLayout narrow action={action}>
        <div className="pt-10">
          <Spinner size="lg" color="text-accent" label="Opening secure link…" />
        </div>
      </PublicLayout>
    );
  }

  if (error || !file) {
    const message = error ?? 'This shared file does not exist or has expired.';
    const gone = goneLine(message);
    return (
      <PublicLayout narrow action={action}>
        <div className="flex flex-col gap-4 pt-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-surface-2 text-ink-2">
            <LinkSlashIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className={title}>{gone ?? 'Link unavailable'}</h1>
          <p className="font-sans text-base text-ink-2">{gone ? 'Ask the person who sent it for a new one.' : message}</p>
        </div>
      </PublicLayout>
    );
  }

  const downloadButton = (
    <button
      type="button"
      onClick={() => void download()}
      className={`${primary} gap-2`}
    >
      <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
      Download
    </button>
  );

  const progressBar = progress && (
    <ProgressBar progress={progress.percent} label={progress.stage === 'downloading' ? 'Downloading…' : 'Decrypting in your browser…'} />
  );

  if (needsPassword && !opened) {
    return (
      <PublicLayout narrow action={action}>
        <form
          className="flex flex-col gap-5 pt-10"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) void download();
          }}
        >
          <p className={cap}>A file was shared with you</p>
          <div className="flex flex-col gap-2">
            <h1 className={title}>This link has a password</h1>
            <p className="font-sans text-base text-ink-2">The person who sent the link has it. Ask them if you were not given it.</p>
          </div>
          <div>
            <label htmlFor="link-password" className="mb-1 block font-sans text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="link-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              aria-invalid={passwordError ? true : undefined}
              className={`block h-11 w-full rounded-lg border bg-surface px-3 font-sans text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent ${passwordError ? 'border-danger' : 'border-line-strong'}`}
            />
            {passwordError && <p className="mt-1 font-sans text-[13px] text-danger-text">{passwordError}</p>}
          </div>
          {progress ? progressBar : <button type="submit" disabled={!password} className={primary}>Open</button>}
        </form>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout narrow action={action}>
      <div className="flex flex-col gap-6 pt-10">
        <p className={cap}>A file was shared with you</p>
        <div className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-[10px] bg-surface-2 text-ink-2">
              <DocumentIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="break-words font-sans text-lg font-semibold leading-6 text-ink [overflow-wrap:anywhere]">{file.name}</h1>
              <span className="font-sans text-[13px] text-ink-3 tabular-nums">{formatFileSize(file.size)}</span>
            </div>
          </div>
          {progress ? progressBar : downloadButton}
          {(file.expiresAt || file.downloadsRemaining !== undefined) && (
            <div className="flex flex-col gap-2 font-sans text-[13px] text-ink-2">
              {file.expiresAt && (
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 flex-none" aria-hidden="true" />
                  Link expires {new Date(file.expiresAt).toLocaleDateString()}
                </div>
              )}
              {file.downloadsRemaining !== undefined && (
                <div className="flex items-center gap-2">
                  <ArrowDownTrayIcon className="h-4 w-4 flex-none" aria-hidden="true" />
                  {file.downloadsRemaining} {file.downloadsRemaining === 1 ? 'download' : 'downloads'} left
                </div>
              )}
            </div>
          )}
        </div>
        <p className="font-sans text-[13px] leading-[18px] text-ink-3">Decrypted in this browser. The key is in the link itself and never reached the server.</p>
      </div>
    </PublicLayout>
  );
};

export default SharedPage;
