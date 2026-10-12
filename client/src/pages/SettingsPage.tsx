/**
 * CrypticStorage - Settings Page
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircleIcon, ShieldCheckIcon, KeyIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { TwoFactorSettings } from '../components/auth/TwoFactorSettings';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../hooks/useAuth';
import { useEncryption } from '../hooks/useEncryption';
import { useToast } from '../hooks/useToast';
import ApiService, { type StorageStats } from '../services/api.service';
import { formatFileSize } from '../services/file.service';

type SettingsTab = 'profile' | 'security' | '2fa' | 'storage';

const tabs: { id: SettingsTab; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'profile', name: 'Profile', icon: UserCircleIcon },
  { id: 'security', name: 'Security', icon: ShieldCheckIcon },
  { id: '2fa', name: 'Two-factor', icon: KeyIcon },
  { id: 'storage', name: 'Storage', icon: CircleStackIcon },
];

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading, changePassword, deleteAccount, lock } = useAuth();
  const { generatePassword, generateFingerprint } = useEncryption();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    ApiService.getStorageStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Account, security and storage</p>
        </div>

        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                    active ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="max-w-2xl">
          {activeTab === 'profile' && (
            <Card variant="bordered" padding="lg">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Profile</h2>
              <div className="space-y-4">
                <Input label="Email" type="email" value={user?.email ?? ''} disabled helperText="Your email is also the salt for your key derivation, so it cannot be changed here." />
                <p className="text-sm text-gray-600 dark:text-gray-400">Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
                <Button variant="secondary" onClick={lock}>
                  Lock vault
                </Button>
              </div>
            </Card>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <Card variant="bordered" padding="lg">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Change password</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Your master key is re-wrapped locally; no files need to be re-encrypted. Other sessions are signed out.</p>
                <div className="space-y-4">
                  <Input label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                  <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                  <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void handleChangePassword()} isLoading={isLoading} disabled={!currentPassword || !newPassword}>
                      Change password
                    </Button>
                    <Button variant="secondary" onClick={handleGeneratePassword}>
                      Generate a strong password
                    </Button>
                  </div>
                </div>
              </Card>

              <Card variant="bordered" padding="lg">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Master key fingerprint</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Compare this on two devices to confirm they hold the same key.</p>
                <Button variant="secondary" onClick={async () => setFingerprint(await generateFingerprint())}>
                  Show fingerprint
                </Button>
                {fingerprint && <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg font-mono text-sm break-all">{fingerprint}</div>}
              </Card>
            </div>
          )}

          {activeTab === '2fa' && (
            <Card variant="bordered" padding="lg">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Two-factor authentication</h2>
              <TwoFactorSettings />
            </Card>
          )}

          {activeTab === 'storage' && (
            <Card variant="bordered" padding="lg">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Storage</h2>
              <div className="space-y-6">
                <div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className={`h-2 rounded-full ${percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-yellow-500' : 'bg-indigo-600'}`} style={{ width: `${percent}%` }} />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    {formatFileSize(used)} of {formatFileSize(limit)} used
                    {stats && ` · ${stats.fileCount} files in ${stats.folderCount} folders`}
                  </p>
                </div>
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Danger zone</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Deleting your account permanently removes every file and share. There is no recovery.</p>
                  <Button variant="danger" onClick={() => setShowDelete(true)}>
                    Delete account
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        <Modal isOpen={showDelete} onClose={() => setShowDelete(false)} title="Delete your account?" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Type your password to confirm. All encrypted files are destroyed immediately.</p>
            <Input type="password" label="Password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDelete(false)}>
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
