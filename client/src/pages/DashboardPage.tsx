/**
 * CrypticStorage - Dashboard Page
 * Command center with vault overview and stats
 */

import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { useAuth } from '../hooks/useAuth';
import { useFiles } from '../hooks/useFiles';

export const DashboardPage: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { files, isLoading, loadFiles } = useFiles();

  useEffect(() => {
    loadFiles();
    refreshProfile().catch(console.error);
  }, []);

  // Calculate stats
  const totalFiles = files.length;
  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  const recentFiles = [...files]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Storage calculation
  const storageLimit = 10 * 1024 * 1024 * 1024; // 10GB
  const storagePercent = (totalSize / storageLimit) * 100;

  if (isLoading && files.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-cipher-slate border-t-cipher-phosphor rounded-full animate-spin" />
            <span className="font-mono text-xs text-text-muted">LOADING VAULT DATA...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-display text-3xl text-text-primary mb-2">
            Welcome back, {user?.username || 'Agent'}
          </h1>
          <p className="font-mono text-xs tracking-wider text-text-muted">
            VAULT STATUS: <span className="text-cipher-phosphor">SECURE</span>
          </p>
        </motion.div>

        {/* Quick Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* Total Files */}
          <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs tracking-wider text-text-muted mb-2">TOTAL FILES</p>
                <p className="font-display text-4xl text-text-primary">{totalFiles}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-cipher-charcoal border border-cipher-slate/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-cipher-phosphor" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Storage Used */}
          <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-amber/50 to-transparent" />
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs tracking-wider text-text-muted mb-2">STORAGE USED</p>
                <p className="font-display text-4xl text-text-primary">{formatBytes(totalSize)}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-cipher-charcoal border border-cipher-slate/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-cipher-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Encryption Status */}
          <div className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-cyan/50 to-transparent" />
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs tracking-wider text-text-muted mb-2">ENCRYPTION</p>
                <p className="font-mono text-lg text-cipher-phosphor">AES-256-GCM</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-cipher-charcoal border border-cipher-slate/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-cipher-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Storage Chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="lg:col-span-2 bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
            <h3 className="font-mono text-xs tracking-wider text-text-muted mb-6">STORAGE CAPACITY</h3>

            {/* Visual Storage Bar */}
            <div className="mb-6">
              <div className="h-4 bg-cipher-charcoal rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${storagePercent}%` }}
                  transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-cipher-phosphor to-cipher-cyan"
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="font-mono text-xs text-text-muted">{formatBytes(totalSize)} used</span>
                <span className="font-mono text-xs text-text-muted">{formatBytes(storageLimit)} total</span>
              </div>
            </div>

            {/* Storage Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Documents', percent: 45, color: 'bg-cipher-phosphor' },
                { label: 'Images', percent: 30, color: 'bg-cipher-amber' },
                { label: 'Other', percent: 25, color: 'bg-cipher-cyan' },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="w-16 h-16 mx-auto relative">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        className="text-cipher-charcoal"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray={`${item.percent * 1.76} 176`}
                        className={item.color.replace('bg-', 'text-')}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-mono text-xs text-text-primary">
                      {item.percent}%
                    </span>
                  </div>
                  <p className="font-mono text-xs text-text-muted mt-2">{item.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent Files */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-xs tracking-wider text-text-muted">RECENT FILES</h3>
              <Link
                to="/files"
                className="font-mono text-xs text-cipher-phosphor hover:text-cipher-amber transition-colors"
              >
                VIEW ALL
              </Link>
            </div>

            {recentFiles.length > 0 ? (
              <div className="space-y-3">
                {recentFiles.map((file, index) => (
                  <motion.div
                    key={file.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
                    className="flex items-center gap-3 p-3 bg-cipher-charcoal/50 rounded-lg border border-cipher-slate/20 hover:border-cipher-phosphor/30 transition-colors"
                  >
                    <div className="w-8 h-8 rounded bg-cipher-slate/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-text-primary truncate">{file.name}</p>
                      <p className="font-mono text-xs text-text-muted">{formatBytes(file.size)}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-cipher-slate mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <p className="font-mono text-xs text-text-muted">NO FILES YET</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="bg-cipher-obsidian border border-cipher-slate/30 rounded-xl p-6 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cipher-phosphor/50 to-transparent" />
          <h3 className="font-mono text-xs tracking-wider text-text-muted mb-4">QUICK ACTIONS</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              to="/files"
              className="flex items-center justify-center gap-3 px-4 py-4 bg-cipher-phosphor text-cipher-black rounded-lg font-mono text-xs tracking-wider hover:shadow-glow-md hover:-translate-y-0.5 transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              UPLOAD FILES
            </Link>
            <Link
              to="/files"
              className="flex items-center justify-center gap-3 px-4 py-4 bg-cipher-charcoal text-text-primary rounded-lg font-mono text-xs tracking-wider border border-cipher-slate hover:border-cipher-phosphor/50 hover:bg-cipher-slate transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              BROWSE FILES
            </Link>
            <Link
              to="/settings"
              className="flex items-center justify-center gap-3 px-4 py-4 bg-cipher-charcoal text-text-primary rounded-lg font-mono text-xs tracking-wider border border-cipher-slate hover:border-cipher-phosphor/50 hover:bg-cipher-slate transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              SETTINGS
            </Link>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
