/**
 * CrypticStorage - Files Page
 * Folder navigation, upload, download, preview, sharing and deletion.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpTrayIcon, ChevronRightIcon, FolderIcon, FolderPlusIcon, HomeIcon, TrashIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { FileList } from '../components/files/FileList';
import { FileUpload } from '../components/files/FileUpload';
import { FilePreview } from '../components/files/FilePreview';
import { ShareDialog, type ShareLink as DialogShareLink, type ShareOptions } from '../components/files/ShareDialog';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useFiles } from '../hooks/useFiles';
import { useUIStore } from '../stores/ui.store';
import FileService, { formatFileSize } from '../services/file.service';
import ShareService, { type ShareLinkWithKey } from '../services/share.service';
import ApiService from '../services/api.service';

function toDialogLink(link: ShareLinkWithKey): DialogShareLink {
  return {
    id: link.id,
    url: link.fullUrl,
    createdAt: new Date(link.createdAt),
    expiresAt: link.expiresAt ? new Date(link.expiresAt) : undefined,
    maxDownloads: link.maxDownloads,
    downloadCount: link.downloadCount,
    password: link.passwordProtected,
  };
}

export interface FilesPageProps {
  /** 'shared' shows only what other people shared with this account. */
  view?: 'files' | 'shared';
}

export const FilesPage: React.FC<FilesPageProps> = ({ view = 'files' }) => {
  const navigate = useNavigate();
  const { folderId: routeFolderId } = useParams<{ folderId?: string }>();
  const { files, folders, breadcrumbs, sharedWithMe, selectedFileIds, uploadProgress, isLoading, loadFiles, loadSharedWithMe, uploadFiles, downloadFile, deleteFiles, createFolder, deleteFolder } =
    useFiles();
  const addToast = useUIStore((s) => s.addToast);

  const currentFolderId = routeFolderId ?? null;
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const [existingLinks, setExistingLinks] = useState<DialogShareLink[]>([]);

  useEffect(() => {
    void loadFiles(currentFolderId);
    if (!currentFolderId) void loadSharedWithMe();
  }, [currentFolderId, loadFiles, loadSharedWithMe]);

  const goTo = useCallback((folderId: string | null) => navigate(folderId ? `/files/${folderId}` : '/files'), [navigate]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName.trim(), currentFolderId);
      setNewFolderName('');
      setShowCreateFolder(false);
    } catch {
      // toast already shown
    }
  };

  const handleUpload = async (dropped: File[]) => {
    await uploadFiles(dropped, currentFolderId);
  };

  const handleDeleteSelected = async () => {
    if (selectedFileIds.size === 0) return;
    if (window.confirm(`Delete ${selectedFileIds.size} file(s)? This cannot be undone.`)) await deleteFiles(Array.from(selectedFileIds));
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    if (window.confirm(`Delete folder "${name}" and everything inside it?`)) await deleteFolder(id);
  };

  const openShare = async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    setShareTarget({ id: file.id, name: file.name });
    try {
      setExistingLinks((await ShareService.listShareLinks(fileId)).map(toDialogLink));
    } catch {
      setExistingLinks([]);
    }
  };

  const createShare = async (options: ShareOptions): Promise<DialogShareLink> => {
    try {
      const link = await ShareService.createShareLink({ fileId: options.fileId, password: options.password, expiresAt: options.expiresAt, maxDownloads: options.maxDownloads });
      addToast({ type: 'success', message: 'Share link created', description: 'The decryption key is in the link itself. Anyone with the link can open the file.' });
      return toDialogLink(link);
    } catch (error) {
      addToast({ type: 'error', message: 'Could not create share link', description: error instanceof Error ? error.message : undefined });
      throw error;
    }
  };

  const decryptForPreview = useCallback(async (fileId: string): Promise<string> => {
    const file = await FileService.downloadFile(fileId);
    return URL.createObjectURL(file.blob);
  }, []);

  const previewFile = previewId ? files.find((f) => f.id === previewId) ?? null : null;
  const uploads = Array.from(uploadProgress.values());

  const sharedSection = (
    <section>
        <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Shared with me</h2>
        {sharedWithMe.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-400">Nothing has been shared with you yet.</p>}
        <div className="space-y-2">
          {sharedWithMe.map((file) => (
            <div key={file.shareId} className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatFileSize(file.size)} · from {file.sharedBy}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                onClick={async () => {
                  try {
                    const shared = (await ApiService.getSharedWithMe()).find((s) => s.shareId === file.shareId);
                    if (!shared) throw new Error('Share no longer available');
                    const decrypted = await FileService.downloadSharedFile(shared);
                    FileService.saveBlob(decrypted.blob, decrypted.name);
                  } catch (error) {
                    addToast({ type: 'error', message: 'Download failed', description: error instanceof Error ? error.message : undefined });
                  }
                }}
              >
                Download
              </Button>
            </div>
          ))}
        </div>
    </section>
  );

  if (view === 'shared') {
    return (
      <DashboardLayout>
        <div className="space-y-6">{sharedSection}</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Files</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Everything here is encrypted before it leaves your browser.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateFolder(true)} variant="secondary" leftIcon={<FolderPlusIcon className="h-5 w-5" />}>
              New folder
            </Button>
            <Button onClick={() => setShowUpload(true)} leftIcon={<ArrowUpTrayIcon className="h-5 w-5" />}>
              Upload
            </Button>
          </div>
        </div>

        <nav className="flex items-center flex-wrap gap-1 text-sm" aria-label="Breadcrumb">
          <button onClick={() => goTo(null)} className={`flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 ${!currentFolderId ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
            <HomeIcon className="h-4 w-4" /> Home
          </button>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id}>
              <ChevronRightIcon className="h-4 w-4 text-gray-400" />
              <button
                onClick={() => goTo(crumb.id)}
                className={`hover:text-indigo-600 dark:hover:text-indigo-400 ${index === breadcrumbs.length - 1 ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {selectedFileIds.size > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm text-indigo-900 dark:text-indigo-100">{selectedFileIds.size} selected</span>
            <Button variant="danger" size="sm" onClick={handleDeleteSelected} leftIcon={<TrashIcon className="h-4 w-4" />}>
              Delete
            </Button>
          </div>
        )}

        {folders.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Folders</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {folders.map((folder) => (
                <div key={folder.id} className="group relative flex items-center gap-2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow">
                  <button onClick={() => goTo(folder.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <FolderIcon className="h-6 w-6 text-indigo-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{folder.name}</span>
                  </button>
                  <button
                    onClick={() => void handleDeleteFolder(folder.id, folder.name)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                    aria-label={`Delete folder ${folder.name}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <FileList
          files={files.map((f) => ({ id: f.id, name: f.name, size: f.size, mimeType: f.mimeType, uploadedAt: f.createdAt }))}
          isLoading={isLoading}
          emptyMessage={folders.length ? 'No files in this folder yet' : 'No files yet. Upload something to get started.'}
          onFileClick={(id) => setPreviewId(id)}
          onFileDownload={(id) => void downloadFile(id)}
          onFileDelete={(id) => {
            const name = files.find((f) => f.id === id)?.name ?? 'this file';
            if (window.confirm(`Delete "${name}"? This cannot be undone.`)) void deleteFiles([id]);
          }}
          onFileShare={(id) => void openShare(id)}
        />

        <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload files" size="lg">
          <FileUpload onUpload={handleUpload} uploads={uploads} />
        </Modal>

        <Modal isOpen={showCreateFolder} onClose={() => setShowCreateFolder(false)} title="New folder" size="sm">
          <div className="space-y-4">
            <Input
              label="Folder name"
              placeholder="e.g. Tax documents"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateFolder();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreateFolder(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleCreateFolder()} disabled={!newFolderName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </Modal>

        <FilePreview
          isOpen={previewFile !== null}
          onClose={() => setPreviewId(null)}
          file={previewFile ? { id: previewFile.id, name: previewFile.name, mimeType: previewFile.mimeType, size: previewFile.size } : null}
          decryptFile={decryptForPreview}
          onDownload={previewFile ? () => void downloadFile(previewFile.id) : undefined}
          onShare={previewFile ? () => void openShare(previewFile.id) : undefined}
        />

        <ShareDialog isOpen={shareTarget !== null} onClose={() => setShareTarget(null)} file={shareTarget} onCreateShare={createShare} existingShares={existingLinks} />
      </div>
    </DashboardLayout>
  );
};

export default FilesPage;
