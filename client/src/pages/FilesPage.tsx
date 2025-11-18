/**
 * CrypticStorage - Files Page
 * Encrypted file browser with cipher aesthetic
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { FileList } from '../components/files/FileList';
import { FileUpload } from '../components/files/FileUpload';
import { useFiles } from '../hooks/useFiles';
import { useUIStore } from '../stores/ui.store';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';

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
    { id: null, name: 'Root' },
  ];

  if (currentFolder) {
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
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div>
            <h1 className="font-display text-3xl text-text-primary mb-2">File Vault</h1>
            <p className="font-mono text-xs tracking-wider text-text-muted">
              ENCRYPTED FILE STORAGE
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => openModal('createFolder')}
              variant="secondary"
              size="sm"
              leftIcon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              }
            >
              NEW FOLDER
            </Button>
            <Button
              onClick={() => setShowUpload(true)}
              size="sm"
              leftIcon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              }
            >
              UPLOAD
            </Button>
          </div>
        </motion.div>

        {/* Breadcrumbs */}
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex items-center gap-2 p-3 bg-cipher-obsidian border border-cipher-slate/30 rounded-lg"
        >
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id || 'root'}>
              {index > 0 && (
                <svg className="w-4 h-4 text-cipher-slate" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              <button
                onClick={() => navigateToFolder(crumb.id)}
                className={`flex items-center gap-2 font-mono text-xs tracking-wider transition-colors ${
                  index === breadcrumbs.length - 1
                    ? 'text-cipher-phosphor'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {index === 0 && (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                )}
                {crumb.name.toUpperCase()}
              </button>
            </React.Fragment>
          ))}
        </motion.nav>

        {/* Selection Actions Bar */}
        {selectedFileIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-4 bg-cipher-phosphor/10 border border-cipher-phosphor/30 rounded-lg"
          >
            <span className="font-mono text-xs text-cipher-phosphor">
              {selectedFileIds.size} ITEM{selectedFileIds.size > 1 ? 'S' : ''} SELECTED
            </span>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={handleDeleteSelected}>
                DELETE
              </Button>
            </div>
          </motion.div>
        )}

        {/* File List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <FileList
            files={files}
            folders={folders}
            onFolderClick={handleFolderClick}
            isLoading={isLoading}
          />
        </motion.div>

        {/* Upload Modal */}
        {showUpload && (
          <Modal
            isOpen={showUpload}
            onClose={() => setShowUpload(false)}
            title="UPLOAD FILES"
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
          title="CREATE NEW FOLDER"
        >
          <div className="space-y-4">
            <Input
              label="FOLDER NAME"
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
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeModal}>
                CANCEL
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                CREATE
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
};

export default FilesPage;
