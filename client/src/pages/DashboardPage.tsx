/**
 * CrypticStorage - Dashboard Page
 * Main dashboard with overview, storage stats, and recent files
 */

import React, { useEffect } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { StorageChart } from '../components/dashboard/StorageChart';
import { RecentFiles } from '../components/dashboard/RecentFiles';
import { QuickStats } from '../components/dashboard/QuickStats';
import { useAuth } from '../hooks/useAuth';
import { useFiles } from '../hooks/useFiles';
import { Spinner } from '../components/common/Spinner';

export const DashboardPage: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { files, isLoading, loadFiles } = useFiles();

  useEffect(() => {
    // Load files and refresh profile on mount
    loadFiles();
    refreshProfile().catch(console.error);
  }, []);

  // Calculate stats
  const totalFiles = files.length;
  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  const recentFiles = [...files]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  if (isLoading && files.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back, {user?.username}!
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Here's an overview of your encrypted storage
          </p>
        </div>

        {/* Quick Stats */}
        <QuickStats totalFiles={totalFiles} totalSize={totalSize} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Storage Chart */}
          <div className="lg:col-span-2">
            <StorageChart
              used={totalSize}
              total={10 * 1024 * 1024 * 1024} // 10GB default
            />
          </div>

          {/* Recent Files */}
          <div className="lg:col-span-1">
            <RecentFiles files={recentFiles} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a
              href="/files"
              className="flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            >
              Upload Files
            </a>
            <a
              href="/files"
              className="flex items-center justify-center px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Browse Files
            </a>
            <a
              href="/settings"
              className="flex items-center justify-center px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Settings
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
