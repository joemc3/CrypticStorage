/**
 * CrypticStorage - Dashboard Page
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { StorageChart } from '../components/dashboard/StorageChart';
import { RecentFiles } from '../components/dashboard/RecentFiles';
import { QuickStats, type StatCard } from '../components/dashboard/QuickStats';
import { useAuth } from '../hooks/useAuth';
import { useFiles } from '../hooks/useFiles';
import ApiService, { type StorageStats } from '../services/api.service';

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
  const folderCount = stats?.folderCount ?? 0;
  const cards: StatCard[] = [
    {
      id: 'items',
      label: 'Items',
      value: ((stats?.fileCount ?? files.length) + folderCount).toLocaleString(),
      detail: `in ${folderCount.toLocaleString()} ${folderCount === 1 ? 'folder' : 'folders'}`,
    },
    { id: 'shared', label: 'Shared with me', value: sharedWithMe.length.toLocaleString() },
  ];

  const recent = [...files]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, uploadedAt: f.createdAt }));

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <h1 className="font-sans text-2xl font-semibold leading-[30px] tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]">Your safe</h1>

        <QuickStats stats={cards} isLoading={isLoading && !stats}>
          <StorageChart data={{ used, total: limit }} />
        </QuickStats>

        <RecentFiles files={recent} isLoading={isLoading && files.length === 0} onFileClick={(id) => void downloadFile(id)} onViewAll={() => navigate('/files')} />
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
