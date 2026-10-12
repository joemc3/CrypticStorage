/**
 * CrypticStorage - Dashboard Page
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DocumentIcon, FolderIcon, ShareIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { StorageChart } from '../components/dashboard/StorageChart';
import { RecentFiles } from '../components/dashboard/RecentFiles';
import { QuickStats, type StatCard } from '../components/dashboard/QuickStats';
import { useAuth } from '../hooks/useAuth';
import { useFiles } from '../hooks/useFiles';
import ApiService, { type StorageStats } from '../services/api.service';
import { formatFileSize } from '../services/file.service';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { files, isLoading, loadFiles, sharedWithMe, loadSharedWithMe, downloadFile } = useFiles();
  const [stats, setStats] = useState<StorageStats | null>(null);

  useEffect(() => {
    void loadFiles(null);
    void loadSharedWithMe();
    refreshProfile().catch(() => undefined);
    ApiService.getStorageStats()
      .then(setStats)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const used = stats?.used ?? user?.storageUsed ?? 0;
  const limit = stats?.limit ?? user?.storageLimit ?? 1;
  const cards: StatCard[] = [
    { id: 'files', label: 'Files', value: (stats?.fileCount ?? files.length).toLocaleString(), icon: DocumentIcon, color: 'blue' },
    { id: 'folders', label: 'Folders', value: (stats?.folderCount ?? 0).toLocaleString(), icon: FolderIcon, color: 'indigo' },
    { id: 'shared', label: 'Shared with me', value: sharedWithMe.length.toLocaleString(), icon: ShareIcon, color: 'purple' },
    { id: 'used', label: 'Storage used', value: formatFileSize(used), icon: CloudArrowUpIcon, color: 'green' },
  ];

  const recent = [...files]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, uploadedAt: f.createdAt }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome back</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{user?.email}</p>
        </div>

        <QuickStats stats={cards} isLoading={isLoading && !stats} variant="compact" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <StorageChart data={{ used, total: limit }} variant="simple" />
          </div>
          <div className="lg:col-span-1">
            <RecentFiles files={recent} isLoading={isLoading && files.length === 0} onFileClick={(id) => void downloadFile(id)} onViewAll={() => navigate('/files')} />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link to="/files" className="flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
              Upload files
            </Link>
            <Link to="/files" className="flex items-center justify-center px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors">
              Browse files
            </Link>
            <Link to="/settings" className="flex items-center justify-center px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors">
              Settings
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
