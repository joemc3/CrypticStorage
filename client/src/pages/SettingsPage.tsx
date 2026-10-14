/**
 * CrypticStorage - Settings Page
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { TwoFactorSettings } from '../components/auth/TwoFactorSettings';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { Fingerprint } from '../components/common/Fingerprint';
import { ProgressBar } from '../components/common/ProgressBar';
import { useAuth } from '../hooks/useAuth';
import { useEncryption } from '../hooks/useEncryption';
import { useToast } from '../hooks/useToast';
import { useUIStore, type Theme } from '../stores/ui.store';
import CryptoService from '../services/crypto.service';
import ApiService, { type StorageStats } from '../services/api.service';
import { formatFileSize } from '../services/file.service';

type SettingsSection = 'profile' | 'password' | 'fingerprint' | 'two-factor' | 'look' | 'storage' | 'delete';

const LOCK_OPTIONS = [1, 2, 5, 10, 15, 30];
const THEME_OPTIONS: { id: Theme; name: string }[] = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading, changePassword, deleteAccount, refreshProfile } = useAuth();
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const { generatePassword } = useEncryption();
  const { success, error } = useToast();

  // On a phone the page is an index of sections and one section opens at a time; from 720 px all of them show.
  const [open, setOpen] = useState<SettingsSection | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    let live = true;
    if (user?.publicKey) {
      CryptoService.publicKeyFingerprint(user.publicKey)
        .then((f) => live && setFingerprint(f))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [user?.publicKey]);

  useEffect(() => {
    ApiService.getStorageStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  const saveDisplayName = async () => {
    setSavingName(true);
    try {
      await ApiService.updateProfile({ displayName: displayName.trim() || null });
      await refreshProfile();
      success('Name saved');
    } catch {
      error('Could not save your name');
    } finally {
      setSavingName(false);
    }
  };

  const saveLockAfter = async (minutes: number) => {
    try {
      await ApiService.updateProfile({ lockAfterMinutes: minutes });
      await refreshProfile();
    } catch {
      error('Could not save the lock period');
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) return error('New password must be at least 8 characters');
    if (newPassword !== confirmPassword) return error('Passwords do not match');
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      // toast shown by hook
    }
  };

  const handleGeneratePassword = () => {
    const generated = generatePassword(20);
    setNewPassword(generated);
    setConfirmPassword(generated);
    success('Password generated', 'Save it in a password manager before continuing.');
  };

  const handleDelete = async () => {
    try {
      await deleteAccount(deletePassword);
      navigate('/', { replace: true });
    } catch {
      // toast shown by hook
    }
  };

  const used = stats?.used ?? user?.storageUsed ?? 0;
  const limit = stats?.limit ?? user?.storageLimit ?? 1;
  const percent = Math.min(100, (used / limit) * 100);
  const lockMinutes = user?.lockAfterMinutes ?? 5;
  const themeName = THEME_OPTIONS.find((o) => o.id === theme)?.name ?? 'System';

  const sectionClass = (id: SettingsSection) =>
    `${open === id ? '' : 'max-md:hidden'} flex flex-col gap-4 border-t border-line py-6 max-md:border-t-0 max-md:pt-0 md:first:border-t-0 md:first:pt-0`;
  const headingClass = 'text-base font-semibold leading-[22px] text-ink max-md:text-2xl max-md:leading-[30px]';
  const selectClass = 'h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink';
  const noteClass = 'text-[13px] leading-[18px] text-ink-3';

  const indexRows: { id: SettingsSection; label: string; value?: string; mono?: boolean; danger?: boolean }[] = [
    { id: 'profile', label: 'Profile', value: user?.email },
    { id: 'password', label: 'Password' },
    { id: 'fingerprint', label: 'Key fingerprint', value: fingerprint ? `${fingerprint.split(' ').slice(0, 2).join(' ')} …` : undefined, mono: true },
    { id: 'two-factor', label: 'Two-factor', value: user?.twoFactorEnabled ? 'On' : 'Off' },
    { id: 'look', label: 'Lock and look', value: `${lockMinutes} ${lockMinutes === 1 ? 'minute' : 'minutes'} · ${themeName} theme` },
    { id: 'storage', label: 'Storage', value: `${formatFileSize(used)} of ${formatFileSize(limit)}` },
    { id: 'delete', label: 'Delete account', danger: true },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
        <h1 className={`text-2xl font-semibold leading-[30px] tracking-[-.01em] text-ink ${open ? 'max-md:hidden' : ''}`}>Settings</h1>

        {open === null && (
          <ul role="list" className="overflow-hidden rounded-xl border border-line bg-surface md:hidden">
            {indexRows.map((row) => (
              <li key={row.id} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => setOpen(row.id)} className="flex min-h-14 w-full items-center gap-3 py-2 pl-4 pr-3 text-left hover:bg-surface-2">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`font-medium ${row.danger ? 'text-danger-text' : 'text-ink'}`}>{row.label}</span>
                    {row.value && <span className={`truncate text-[13px] leading-[18px] text-ink-3 ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>}
                  </span>
                  <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {open !== null && (
          <button type="button" onClick={() => setOpen(null)} className="-mt-2 flex items-center gap-1 self-start text-sm text-ink-2 md:hidden">
            <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
            Settings
          </button>
        )}

        <div className="flex flex-col">
          <section aria-labelledby="set-profile" className={sectionClass('profile')}>
            <h2 id="set-profile" className={headingClass}>Profile</h2>
            <Input label="Email" type="email" value={user?.email ?? ''} readOnly helperText="Your email is part of how your keys are derived, so it cannot be changed." />
            <div className="flex max-w-[420px] flex-col gap-3">
              <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} helperText="Visible to people you share with." />
              <Button variant="secondary" onClick={() => void saveDisplayName()} isLoading={savingName} className="self-start">
                Save
              </Button>
            </div>
            <p className={noteClass}>Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
          </section>

          <section aria-labelledby="set-password" className={sectionClass('password')}>
            <h2 id="set-password" className={headingClass}>Password</h2>
            <div className="flex max-w-[420px] flex-col gap-4">
              <Input label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
              <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
              <Input label="New password again" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              <p className={noteClass}>Your master key is re-wrapped in this browser; no files need to be re-encrypted. Other sessions are signed out.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void handleChangePassword()} isLoading={isLoading} disabled={!currentPassword || !newPassword}>
                  Change password
                </Button>
                <Button variant="quiet" onClick={handleGeneratePassword}>
                  Generate a strong password
                </Button>
              </div>
            </div>
          </section>

          <section aria-labelledby="set-fingerprint" className={sectionClass('fingerprint')}>
            <h2 id="set-fingerprint" className={headingClass}>Key fingerprint</h2>
            {fingerprint && <Fingerprint value={fingerprint} />}
            <p className={noteClass}>People who share with you compare this, in person or on a call, to know the key is yours.</p>
          </section>

          <section aria-labelledby="set-two-factor" className={sectionClass('two-factor')}>
            <h2 id="set-two-factor" className={headingClass}>Two-factor</h2>
            <TwoFactorSettings />
          </section>

          <section aria-labelledby="set-look" className={sectionClass('look')}>
            <h2 id="set-look" className={headingClass}>Lock and look</h2>
            <div className="flex max-w-[420px] flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="lock-after" className="text-sm font-medium leading-[18px] text-ink">Lock after</label>
                <select id="lock-after" value={lockMinutes} onChange={(e) => void saveLockAfter(Number(e.target.value))} className={selectClass}>
                  {LOCK_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m === 1 ? '1 minute idle' : `${m} minutes idle`}</option>
                  ))}
                </select>
                <span className={noteClass}>It also locks when you close the tab.</span>
              </div>
              <div role="radiogroup" aria-label="Theme" className="flex flex-col gap-1.5">
                <span className="text-sm font-medium leading-[18px] text-ink">Theme</span>
                <div className="grid grid-cols-3 gap-[3px] rounded-[9px] bg-sunk p-[3px]">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={theme === opt.id}
                      onClick={() => setTheme(opt.id)}
                      className={`h-[38px] rounded-[7px] text-sm font-semibold ${theme === opt.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="set-storage" className={sectionClass('storage')}>
            <h2 id="set-storage" className={headingClass}>Storage</h2>
            <div className="flex max-w-[420px] flex-col gap-2">
              <div className="flex items-center justify-between text-sm tabular-nums">
                <span>{formatFileSize(used)} used</span>
                <span className="text-ink-3">of {formatFileSize(limit)}</span>
              </div>
              <ProgressBar progress={percent} showPercentage={false} label="Storage used" variant={percent > 90 ? 'danger' : percent > 75 ? 'warning' : 'default'} />
              {stats && <p className={noteClass}>{stats.fileCount} files in {stats.folderCount} folders</p>}
            </div>
          </section>

          <section aria-labelledby="set-delete" className={sectionClass('delete')}>
            <h2 id="set-delete" className={headingClass}>Delete account</h2>
            <p className="text-sm text-ink-2">Deleting your account permanently removes every file and share. There is no recovery.</p>
            <Button variant="secondary" onClick={() => setShowDelete(true)} className="self-start text-danger-text">
              Delete account
            </Button>
          </section>
        </div>

        <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Delete your account?" size="sm">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-2">Type your password to confirm. All encrypted files are destroyed immediately.</p>
            <Input type="password" label="Password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
            <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Button variant="quiet" onClick={() => setShowDelete(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()} isLoading={isLoading} disabled={!deletePassword}>
                Delete everything
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
