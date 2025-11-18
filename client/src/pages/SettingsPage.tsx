/**
 * CrypticStorage - Settings Page
 * Cipher-styled settings and configuration
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { TwoFactorSetup } from '../components/auth/TwoFactorSetup';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useAuth } from '../hooks/useAuth';
import { useEncryption } from '../hooks/useEncryption';
import { useToast } from '../hooks/useToast';

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
    {
      id: 'profile',
      name: 'PROFILE',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      id: 'security',
      name: 'SECURITY',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      id: '2fa',
      name: '2FA',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      ),
    },
    {
      id: 'storage',
      name: 'STORAGE',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      ),
    },
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
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-display text-3xl text-text-primary mb-2">Settings</h1>
          <p className="font-mono text-xs tracking-wider text-text-muted">
            CONFIGURE YOUR VAULT
          </p>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex gap-2 p-1 bg-cipher-obsidian border border-cipher-slate/30 rounded-lg w-fit"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md font-mono text-xs tracking-wider transition-all ${
                  isActive
                    ? 'bg-cipher-phosphor/10 text-cipher-phosphor border border-cipher-phosphor/30'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tab.icon}
                {tab.name}
              </button>
            );
          })}
        </motion.div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-2xl"
        >
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
              <h2 className="font-mono text-xs tracking-wider text-text-muted mb-6">
                PROFILE INFORMATION
              </h2>
              <div className="space-y-4">
                <Input
                  label="EMAIL"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  helperText="Email cannot be changed"
                />
                <Input
                  label="USERNAME"
                  value={user?.username || ''}
                  disabled
                  helperText="Username is derived from your email"
                />
                <div className="pt-4 border-t border-cipher-slate/30">
                  <p className="font-mono text-xs text-text-muted">
                    ACCOUNT CREATED: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
                <h2 className="font-mono text-xs tracking-wider text-text-muted mb-6">
                  CHANGE PASSPHRASE
                </h2>
                <div className="space-y-4">
                  <Input
                    label="CURRENT PASSPHRASE"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current passphrase"
                  />
                  <Input
                    label="NEW PASSPHRASE"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new passphrase"
                  />
                  <Input
                    label="CONFIRM PASSPHRASE"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new passphrase"
                  />
                  <div className="flex gap-3 pt-2">
                    <Button onClick={handleChangePassword}>UPDATE</Button>
                    <Button variant="secondary" onClick={handleGeneratePassword}>
                      GENERATE STRONG
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-amber/50 to-transparent" />
                <h2 className="font-mono text-xs tracking-wider text-text-muted mb-4">
                  MASTER KEY FINGERPRINT
                </h2>
                <p className="font-mono text-xs text-text-muted mb-4">
                  Use this fingerprint to verify your encryption key on different devices
                </p>
                <Button variant="secondary" onClick={handleShowFingerprint}>
                  SHOW FINGERPRINT
                </Button>
                {keyFingerprint && (
                  <div className="mt-4 p-4 bg-cipher-charcoal rounded-lg font-mono text-xs text-cipher-phosphor break-all">
                    {keyFingerprint}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2FA Tab */}
          {activeTab === '2fa' && (
            <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
              <h2 className="font-mono text-xs tracking-wider text-text-muted mb-4">
                TWO-FACTOR AUTHENTICATION
              </h2>
              <p className="font-mono text-xs text-text-muted mb-6">
                Add an extra layer of security to your vault
              </p>
              <TwoFactorSetup />
            </div>
          )}

          {/* Storage Tab */}
          {activeTab === 'storage' && (
            <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
              <h2 className="font-mono text-xs tracking-wider text-text-muted mb-6">
                STORAGE MANAGEMENT
              </h2>
              <div className="space-y-6">
                <div>
                  <p className="font-mono text-xs text-text-muted mb-3">STORAGE USAGE</p>
                  <div className="h-3 bg-cipher-charcoal rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cipher-phosphor to-cipher-cyan"
                      style={{ width: '45%' }}
                    />
                  </div>
                  <p className="font-mono text-xs text-text-muted mt-2">
                    4.5 GB of 10 GB used
                  </p>
                </div>
                <div className="pt-6 border-t border-cipher-slate/30">
                  <h3 className="font-mono text-xs tracking-wider text-cipher-crimson mb-3">
                    DANGER ZONE
                  </h3>
                  <p className="font-mono text-xs text-text-muted mb-4">
                    Once you delete your account, there is no going back. All files will be permanently deleted.
                  </p>
                  <Button variant="danger">DELETE ACCOUNT</Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
