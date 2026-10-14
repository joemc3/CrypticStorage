import React, { useState, useEffect } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Fingerprint } from '../common/Fingerprint';

export interface RecipientKey {
  email: string;
  /** Fingerprint of the recipient's public key, hex, with or without spaces. */
  fingerprint: string;
}

export interface UserShareRow {
  id: string;
  email: string;
}

export interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    id: string;
    name: string;
  } | null;
  onCreateShare: (options: ShareOptions) => Promise<ShareLink>;
  existingShares?: ShareLink[];
  /** The "with a person" tab appears when both of these are given. */
  onLookupRecipient?: (email: string) => Promise<RecipientKey>;
  onShareWithUser?: (email: string) => Promise<void>;
  /** People this file is already shared with. */
  userShares?: UserShareRow[];
  onRevokeUserShare?: (shareId: string) => Promise<void>;
  /**
   * Email of a recipient whose key changed since the last share. Draws the red callout above the tab.
   * Nothing sets this yet: the handoff stage stores what was trusted and wires it.
   */
  keyChangedFor?: string | null;
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

const EXPIRY_CHOICES: { label: string; hours: number | null }[] = [
  { label: '1 hour', hours: 1 },
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '14 days', hours: 24 * 14 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'No expiry', hours: null },
];

const formatDate = (date: Date): string => new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  file,
  onCreateShare,
  existingShares = [],
  onLookupRecipient,
  onShareWithUser,
  userShares = [],
  onRevokeUserShare,
  keyChangedFor = null,
}) => {
  const hasUserTab = Boolean(onLookupRecipient && onShareWithUser);
  const [tab, setTab] = useState<'user' | 'link'>(hasUserTab ? 'user' : 'link');

  // With a person
  const [email, setEmail] = useState('');
  const [recipient, setRecipient] = useState<RecipientKey | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [verified, setVerified] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // With a link
  const [password, setPassword] = useState('');
  const [expiryHours, setExpiryHours] = useState<number | null>(24 * 7);
  const [maxDownloads, setMaxDownloads] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [createdLink, setCreatedLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTab(hasUserTab ? 'user' : 'link');
      setEmail('');
      setRecipient(null);
      setLookupError(null);
      setVerified(false);
      setPassword('');
      setExpiryHours(24 * 7);
      setMaxDownloads(0);
      setCreatedLink(null);
      setCopied(false);
    }
  }, [isOpen, hasUserTab]);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setRecipient(null);
    setLookupError(null);
    setVerified(false);
  };

  const handleLookup = async () => {
    if (!onLookupRecipient || !email.trim()) return;
    setIsLookingUp(true);
    setLookupError(null);
    try {
      setRecipient(await onLookupRecipient(email.trim()));
      setVerified(false);
    } catch (error) {
      setRecipient(null);
      setLookupError(error instanceof Error ? error.message : 'Could not look up that account');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleShareWithUser = async () => {
    if (!onShareWithUser || !recipient) return;
    setIsSharing(true);
    try {
      await onShareWithUser(recipient.email);
      setEmail('');
      setRecipient(null);
      setVerified(false);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : 'Could not share');
    } finally {
      setIsSharing(false);
    }
  };

  const handleCreateShare = async () => {
    if (!file) return;
    setIsCreating(true);
    try {
      const options: ShareOptions = { fileId: file.id };
      if (password) options.password = password;
      if (expiryHours !== null) options.expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000);
      if (maxDownloads > 0) options.maxDownloads = maxDownloads;
      setCreatedLink(await onCreateShare(options));
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

  const tabClass = (active: boolean) =>
    `h-9 flex-1 rounded-md px-3 text-sm font-semibold transition-colors ${focus} ${active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`;

  const userPanel = (
    <div className="flex flex-col gap-5">
      {keyChangedFor && (
        <div role="alert" className="flex items-start gap-3 rounded-[10px] bg-danger-soft px-4 py-3.5 text-sm leading-5 text-danger-text">
          <ExclamationTriangleIcon className="h-5 w-5 flex-none" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold">{keyChangedFor} has a new key.</span>
            <span>It changed since you last shared with them. Check the fingerprint with them before you share again.</span>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Their account email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            error={lookupError ?? undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleLookup();
            }}
          />
        </div>
        <Button variant="secondary" onClick={() => void handleLookup()} isLoading={isLookingUp} disabled={!email.trim() || recipient !== null}>
          Check key
        </Button>
      </div>

      {recipient && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <p className="break-all text-sm font-semibold text-ink">{recipient.email}</p>
          <Fingerprint value={recipient.fingerprint} verified={verified} />
          <p className="text-sm text-ink-2">Compare this with the Key fingerprint shown in their Settings, in person or on a call.</p>
          <label className="flex items-center gap-3 text-sm text-ink">
            <button
              type="button"
              role="switch"
              aria-checked={verified}
              aria-label="Mark as verified in person"
              onClick={() => setVerified((v) => !v)}
              className={`relative h-6 w-10 flex-none rounded-full transition-colors ${focus} ${verified ? 'bg-accent' : 'bg-line-strong'}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface transition-transform ${verified ? 'translate-x-4' : ''}`} />
            </button>
            I have checked it with them
          </label>
        </div>
      )}

      {userShares.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-2">Already shared with</span>
          <ul role="list" className="flex flex-col gap-1">
            {userShares.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="break-all text-ink">{s.email}</span>
                {onRevokeUserShare && (
                  <Button variant="quiet" size="sm" onClick={() => void onRevokeUserShare(s.id)} aria-label={`Remove ${s.email}`}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const linkForm = (
    <div className="flex flex-col gap-5">
      <Input label="Password (optional)" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} helperText="Send it separately from the link." />

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium text-ink">Expires after</legend>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_CHOICES.map((c) => {
            const on = expiryHours === c.hours;
            return (
              <button
                key={c.label}
                type="button"
                aria-pressed={on}
                onClick={() => setExpiryHours(c.hours)}
                className={`h-9 rounded-full border px-3.5 text-sm font-medium ${focus} ${on ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-strong bg-surface text-ink-2 hover:text-ink'}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span id="download-limit-label" className="text-sm font-medium text-ink">
            Download limit
          </span>
          <span className="text-[13px] leading-[18px] text-ink-3">The link stops working after this many.</span>
        </div>
        <div role="group" aria-labelledby="download-limit-label" className="flex flex-none items-center rounded-lg border border-line-strong bg-surface">
          <button type="button" aria-label="Fewer" disabled={maxDownloads <= 0} onClick={() => setMaxDownloads((n) => Math.max(0, n - 1))} className={`h-11 w-11 text-lg text-ink-2 disabled:opacity-40 ${focus}`}>
            −
          </button>
          <output className="min-w-[4.5rem] text-center text-sm tabular-nums text-ink">{maxDownloads === 0 ? 'No limit' : maxDownloads}</output>
          <button type="button" aria-label="More" disabled={maxDownloads >= 1000} onClick={() => setMaxDownloads((n) => Math.min(1000, n + 1))} className={`h-11 w-11 text-lg text-ink-2 disabled:opacity-40 ${focus}`}>
            +
          </button>
        </div>
      </div>

      {existingShares.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <span className="text-sm text-ink-2">Existing links</span>
          <ul role="list" className="flex max-h-48 flex-col gap-2 overflow-y-auto">
            {existingShares.map((share) => (
              <li key={share.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 p-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-mono text-xs text-ink">{share.url}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    Created {formatDate(share.createdAt)}
                    {share.expiresAt && ` · Expires ${formatDate(share.expiresAt)}`}
                  </p>
                </div>
                <Button variant="quiet" size="sm" onClick={() => void handleCopyLink(share.url)}>
                  Copy
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const linkMade = createdLink && (
    <div className="flex flex-col gap-4">
      <Input label="Link" type="text" value={createdLink.url} readOnly mono onFocus={(e) => e.currentTarget.select()} />
      <div className="flex items-start gap-3 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3.5 text-sm leading-5 text-warn-text">
        <ExclamationTriangleIcon className="h-5 w-5 flex-none" aria-hidden="true" />
        <span>Anyone with this URL can open the file until it expires. Send it only where you would send the file itself.</span>
      </div>
      <dl className="flex flex-col gap-2 text-sm text-ink-2">
        <div className="flex justify-between">
          <dt>Password</dt>
          <dd>{createdLink.password ? 'Yes' : 'No'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Expires</dt>
          <dd>{createdLink.expiresAt ? formatDate(createdLink.expiresAt) : 'Never'}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Downloads</dt>
          <dd className="tabular-nums">{createdLink.maxDownloads ? `${createdLink.downloadCount} of ${createdLink.maxDownloads}` : 'No limit'}</dd>
        </div>
      </dl>
    </div>
  );

  const showUser = hasUserTab && tab === 'user';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share" description={file?.name} size="lg">
      <div className="flex flex-col gap-5 text-ink">
        {hasUserTab && !createdLink && (
          <div role="tablist" aria-label="Share with" className="flex gap-1 rounded-lg bg-sunk p-1">
            <button type="button" role="tab" aria-selected={tab === 'user'} className={tabClass(tab === 'user')} onClick={() => setTab('user')}>
              With a person
            </button>
            <button type="button" role="tab" aria-selected={tab === 'link'} className={tabClass(tab === 'link')} onClick={() => setTab('link')}>
              With a link
            </button>
          </div>
        )}

        {showUser ? userPanel : createdLink ? linkMade : linkForm}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          {createdLink ? (
            <>
              <Button variant="quiet" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => void handleCopyLink(createdLink.url)}>{copied ? 'Copied' : 'Copy link'}</Button>
            </>
          ) : showUser ? (
            <>
              <Button variant="quiet" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void handleShareWithUser()} isLoading={isSharing} disabled={!recipient}>
                Share
              </Button>
            </>
          ) : (
            <>
              <Button variant="quiet" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreateShare()} isLoading={isCreating}>
                Create link
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};
