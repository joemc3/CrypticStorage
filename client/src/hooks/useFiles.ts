/**
 * CrypticStorage - useFiles Hook
 * File and folder operations bound to the file store.
 */

import { useCallback, useState } from 'react';
import { useFileStore } from '../stores/file.store';
import { useUIStore } from '../stores/ui.store';
import { coverFile } from '../services/rules.service';
import FileService, { type FolderListItem, type SharedFileListItem, type UploadProgress } from '../services/file.service';

export const useFiles = () => {
  const store = useFileStore();
  const addToast = useUIStore((s) => s.addToast);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderListItem[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedFileListItem[]>([]);

  const loadFiles = useCallback(
    async (folderId?: string | null) => {
      store.setLoading(true);
      try {
        const id = folderId ?? undefined;
        const [files, folders, trail] = await Promise.all([FileService.listFiles(id), FileService.listFolders(id), FileService.folderPath(id ?? null)]);
        store.setFiles(
          files.map((f) => ({
            id: f.id,
            name: f.name,
            encryptedName: '',
            size: f.size,
            mimeType: f.mimeType,
            folderId: f.folderId ?? null,
            userId: '',
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            shareCount: f.shareCount,
          }))
        );
        store.setFolders(folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId ?? null, userId: '', createdAt: f.createdAt, updatedAt: f.updatedAt })));
        setBreadcrumbs(trail);
      } catch (error) {
        addToast({ type: 'error', message: 'Could not load files', description: error instanceof Error ? error.message : undefined });
      } finally {
        store.setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast]
  );

  const loadSharedWithMe = useCallback(async () => {
    try {
      setSharedWithMe(await FileService.listSharedWithMe());
    } catch {
      setSharedWithMe([]);
    }
  }, []);

  const uploadFiles = useCallback(
    async (files: File[], folderId?: string | null) => {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const localId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const onProgress = (p: UploadProgress) =>
            store.setUploadProgress(localId, {
              fileId: p.fileId ?? localId,
              fileName: p.fileName,
              progress: p.percentage,
              status: p.status === 'completed' ? 'complete' : p.status === 'failed' ? 'error' : p.status === 'encrypting' ? 'encrypting' : 'uploading',
              error: p.error,
            });
          try {
            const uploaded = await FileService.uploadFile(file, folderId ?? undefined, onProgress);
            store.addFile({ id: uploaded.id, name: uploaded.name, encryptedName: '', size: uploaded.size, mimeType: uploaded.mimeType, folderId: uploaded.folderId ?? null, userId: '', createdAt: uploaded.createdAt, updatedAt: uploaded.updatedAt });
            setTimeout(() => store.removeUploadProgress(localId), 3000);
            // A file that lands in a covered folder is wrapped into its rules now, so the gap never shows.
            // If this fails, the repair at the next unlock does it.
            void coverFile(uploaded.id, folderId).catch(() => undefined);
            return uploaded;
          } catch (error) {
            addToast({ type: 'error', message: `Upload failed: ${file.name}`, description: error instanceof Error ? error.message : undefined });
            throw error;
          }
        })
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      if (succeeded > 0) addToast({ type: 'success', message: succeeded === 1 ? 'File uploaded' : `${succeeded} files uploaded` });
      return results;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast]
  );

  const downloadFile = useCallback(
    async (fileId: string) => {
      try {
        await FileService.downloadFileToDevice(fileId);
      } catch (error) {
        addToast({ type: 'error', message: 'Download failed', description: error instanceof Error ? error.message : undefined });
      }
    },
    [addToast]
  );

  const deleteFiles = useCallback(
    async (fileIds: string[]) => {
      try {
        await Promise.all(fileIds.map((id) => FileService.deleteFile(id)));
        store.removeFiles(fileIds);
        store.clearSelection();
        addToast({ type: 'success', message: fileIds.length === 1 ? 'File deleted' : `${fileIds.length} files deleted` });
      } catch (error) {
        addToast({ type: 'error', message: 'Delete failed', description: error instanceof Error ? error.message : undefined });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast]
  );

  const renameFile = useCallback(
    async (fileId: string, newName: string) => {
      try {
        const updated = await FileService.renameFile(fileId, newName);
        store.updateFile(fileId, { name: updated.name, updatedAt: updated.updatedAt });
        addToast({ type: 'success', message: 'File renamed' });
      } catch (error) {
        addToast({ type: 'error', message: 'Rename failed', description: error instanceof Error ? error.message : undefined });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast]
  );

  const createFolder = useCallback(
    async (name: string, parentId?: string | null) => {
      try {
        const folder = await FileService.createFolder(name, parentId ?? undefined);
        store.addFolder({ id: folder.id, name: folder.name, parentId: folder.parentId ?? null, userId: '', createdAt: folder.createdAt, updatedAt: folder.updatedAt });
        addToast({ type: 'success', message: 'Folder created' });
        return folder;
      } catch (error) {
        addToast({ type: 'error', message: 'Could not create folder', description: error instanceof Error ? error.message : undefined });
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast]
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await FileService.deleteFolder(folderId);
        store.removeFolder(folderId);
        addToast({ type: 'success', message: 'Folder deleted' });
      } catch (error) {
        addToast({ type: 'error', message: 'Could not delete folder', description: error instanceof Error ? error.message : undefined });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast]
  );

  const renameFolder = useCallback(
    async (folderId: string, newName: string) => {
      try {
        const updated = await FileService.renameFolder(folderId, newName);
        store.updateFolder(folderId, { name: updated.name, updatedAt: updated.updatedAt });
        addToast({ type: 'success', message: 'Folder renamed' });
      } catch (error) {
        addToast({ type: 'error', message: 'Rename failed', description: error instanceof Error ? error.message : undefined });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addToast]
  );

  const navigateToFolder = useCallback(
    (folderId: string | null) => {
      store.setCurrentFolder(folderId);
      store.clearSelection();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return {
    files: store.files,
    folders: store.folders,
    breadcrumbs,
    sharedWithMe,
    currentFolderId: store.currentFolderId,
    selectedFileIds: store.selectedFileIds,
    uploadProgress: store.uploadProgress,
    isLoading: store.isLoading,
    loadFiles,
    loadSharedWithMe,
    uploadFiles,
    downloadFile,
    deleteFiles,
    renameFile,
    createFolder,
    deleteFolder,
    renameFolder,
    navigateToFolder,
    selectFile: store.selectFile,
    deselectFile: store.deselectFile,
    toggleFileSelection: store.toggleFileSelection,
    selectAllFiles: store.selectAllFiles,
    clearSelection: store.clearSelection,
  };
};
