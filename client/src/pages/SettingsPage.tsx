/**
 * CrypticStorage - Settings Page
 * User settings including profile, security, and 2FA
 */

import React, { useState } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { TwoFactorSetup } from '../components/auth/TwoFactorSetup';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useAuth } from '../hooks/useAuth';
import { useEncryption } from '../hooks/useEncryption';
import { useToast } from '../hooks/useToast';
import {
  UserCircleIcon,
  ShieldCheckIcon,
  KeyIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

type SettingsTab = 'profile' | 'security' | '2fa' | 'storage';

export const SettingsPage: React.FC = () => {
  const { user, changePassword } = useAuth();
  const { generatePassword, generateFingerprint } = useEncryption();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserCircleIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    { id: '2fa', name: 'Two-Factor Auth', icon: KeyIcon },
    { id: 'storage', name: 'Storage', icon: TrashIcon },
  ];

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      error('Passwords do not match');
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      // Error is handled by useAuth hook
    }
  };

  const handleGeneratePassword = () => {
    const generated = generatePassword(16);
    setNewPassword(generated);
    setConfirmPassword(generated);
    success('Password generated', 'Please save this password securely');
  };

  const handleShowFingerprint = async () => {
    const fingerprint = await generateFingerprint();
    if (fingerprint) {
      setKeyFingerprint(fingerprint);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="max-w-2xl">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <Card>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Profile Information
              </h2>
              <div className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  helperText="Email cannot be changed"
                />
                <Input
                  label="Username"
                  value={user?.username || ''}
                  disabled
                  helperText="Username is derived from your email"
                />
                <div className="pt-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Account created: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <Card>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Change Password
                </h2>
                <div className="space-y-4">
                  <Input
                    label="Current Password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <Input
                    label="New Password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <Input
                    label="Confirm New Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleChangePassword}>Change Password</Button>
                    <Button variant="secondary" onClick={handleGeneratePassword}>
                      Generate Strong Password
                    </Button>
                  </div>
                </div>
              </Card>

              <Card>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Master Key Fingerprint
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Use this fingerprint to verify your encryption key on different devices
                </p>
                <Button variant="secondary" onClick={handleShowFingerprint}>
                  Show Fingerprint
                </Button>
                {keyFingerprint && (
                  <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg font-mono text-sm">
                    {keyFingerprint}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* 2FA Tab */}
          {activeTab === '2fa' && (
            <Card>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Two-Factor Authentication
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Add an extra layer of security to your account with two-factor authentication
              </p>
              <TwoFactorSetup />
            </Card>
          )}

          {/* Storage Tab */}
          {activeTab === 'storage' && (
            <Card>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Storage Management
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Storage Usage
                  </label>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full"
                      style={{ width: '45%' }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    4.5 GB of 10 GB used
                  </p>
                </div>
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Danger Zone
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Once you delete your account, there is no going back. All your files will be
                    permanently deleted.
                  </p>
                  <Button variant="danger">Delete Account</Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};
