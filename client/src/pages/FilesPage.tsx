/**
 * CrypticStorage - Files Page
 * File manager with upload, download, and folder navigation
 */

import React, { useState } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { FileList } from '../components/files/FileList';
import { FileUpload } from '../components/files/FileUpload';
import { useFiles } from '../hooks/useFiles';
import { useUIStore } from '../stores/ui.store';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import {
  FolderPlusIcon,
  ArrowUpTrayIcon,
  HomeIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

export const FilesPage: React.FC = () => {
  const {
    files,
    folders,
    currentFolderId,
    selectedFileIds,
    isLoading,
    uploadFiles,
    createFolder,
    deleteFiles,
    navigateToFolder,
  } = useFiles();

  const { openModal, closeModal, modal } = useUIStore();
  const [newFolderName, setNewFolderName] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  // Get current folder and breadcrumb path
  const currentFolder = folders.find((f) => f.id === currentFolderId);
  const breadcrumbs: Array<{ id: string | null; name: string }> = [
    { id: null, name: 'Home' },
  ];

  if (currentFolder) {
    // Build breadcrumb path (simplified - in real app would traverse parent chain)
    breadcrumbs.push({ id: currentFolder.id, name: currentFolder.name });
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder(newFolderName, currentFolderId || undefined);
      setNewFolderName('');
      closeModal();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleFileUpload = async (uploadedFiles: File[]) => {
    await uploadFiles(uploadedFiles, currentFolderId || undefined);
    setShowUpload(false);
  };

  const handleDeleteSelected = async () => {
    if (selectedFileIds.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedFileIds.size} file(s)?`
    );

    if (confirmed) {
      await deleteFiles(Array.from(selectedFileIds));
    }
  };

  const handleFolderClick = (folderId: string) => {
    navigateToFolder(folderId);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Files</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage your encrypted files and folders
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => openModal('createFolder')}
              variant="secondary"
              leftIcon={<FolderPlusIcon className="h-5 w-5" />}
            >
              New Folder
            </Button>
            <Button
              onClick={() => setShowUpload(true)}
              leftIcon={<ArrowUpTrayIcon className="h-5 w-5" />}
            >
              Upload Files
            </Button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <nav className="flex items-center space-x-2 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id || 'root'}>
              {index > 0 && (
                <ChevronRightIcon className="h-4 w-4 text-gray-400" />
              )}
              <button
                onClick={() => navigateToFolder(crumb.id)}
                className={`flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors ${
                  index === breadcrumbs.length - 1
                    ? 'text-gray-900 dark:text-white font-medium'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {index === 0 && <HomeIcon className="h-4 w-4" />}
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Actions Bar */}
        {selectedFileIds.size > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm text-indigo-900 dark:text-indigo-100">
              {selectedFileIds.size} item(s) selected
            </span>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={handleDeleteSelected}>
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* File List */}
        <FileList
          files={files}
          folders={folders}
          onFolderClick={handleFolderClick}
          isLoading={isLoading}
        />

        {/* Upload Modal */}
        {showUpload && (
          <Modal
            isOpen={showUpload}
            onClose={() => setShowUpload(false)}
            title="Upload Files"
          >
            <FileUpload
              onUpload={handleFileUpload}
              currentFolderId={currentFolderId || undefined}
            />
          </Modal>
        )}

        {/* Create Folder Modal */}
        <Modal
          isOpen={modal.type === 'createFolder'}
          onClose={closeModal}
          title="Create New Folder"
        >
          <div className="space-y-4">
            <Input
              label="Folder Name"
              placeholder="Enter folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default FilesPage;
