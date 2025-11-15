/**
 * CrypticStorage - useFiles Hook
 * Custom hook for file operations
 */

import { useCallback, useEffect } from 'react';
import { useFileStore } from '../stores/file.store';
import { useUIStore } from '../stores/ui.store';
import FileService from '../services/file.service';
import type { UploadProgress } from '../services/file.service';

export const useFiles = () => {
  const {
    files,
    folders,
    currentFolderId,
    selectedFileIds,
    uploadProgress,
    isLoading,
    setFiles,
    setFolders,
    addFile,
    removeFile,
    removeFiles,
    addFolder,
    removeFolder,
    setCurrentFolder,
    selectFile,
    deselectFile,
    toggleFileSelection,
    selectAllFiles,
    clearSelection,
    setUploadProgress,
    removeUploadProgress,
    setLoading,
  } = useFileStore();

  const { addToast } = useUIStore();

  /**
   * Load files and folders for current folder
   */
  const loadFiles = useCallback(async (folderId?: string) => {
    try {
      setLoading(true);
      const [filesData, foldersData] = await Promise.all([
        FileService.listFiles(folderId),
        FileService.listFolders(folderId),
      ]);

      setFiles(
        filesData.map((file) => ({
          id: file.id,
          name: file.name,
          encryptedName: file.name,
          size: file.size,
          mimeType: file.mimeType,
          folderId: file.folderId || null,
          userId: '',
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        }))
      );

      setFolders(
        foldersData.map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId || null,
          userId: '',
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        }))
      );
    } catch (error: any) {
      console.error('Failed to load files:', error);
      addToast({
        type: 'error',
        message: 'Failed to load files',
        description: error.message || 'An error occurred while loading files',
      });
    } finally {
      setLoading(false);
    }
  }, [setFiles, setFolders, setLoading, addToast]);

  /**
   * Upload file(s)
   */
  const uploadFiles = useCallback(
    async (files: File[], folderId?: string) => {
      const uploadPromises = files.map((file) => {
        const fileId = `upload-${Date.now()}-${Math.random()}`;

        return FileService.uploadFile(
          file,
          folderId,
          (progress: UploadProgress) => {
            setUploadProgress(fileId, {
              fileId: progress.fileId || fileId,
              fileName: progress.fileName,
              progress: progress.percentage,
              status:
                progress.status === 'completed'
                  ? 'complete'
                  : progress.status === 'failed'
                  ? 'error'
                  : progress.status === 'encrypting'
                  ? 'encrypting'
                  : 'uploading',
              error: progress.error,
            });
          }
        )
          .then((fileData) => {
            addFile({
              id: fileData.id,
              name: fileData.name,
              encryptedName: fileData.name,
              size: fileData.size,
              mimeType: fileData.mimeType,
              folderId: fileData.folderId || null,
              userId: '',
              createdAt: fileData.createdAt,
              updatedAt: fileData.updatedAt,
            });

            addToast({
              type: 'success',
              message: 'File uploaded',
              description: `${fileData.name} uploaded successfully`,
            });

            setTimeout(() => {
              removeUploadProgress(fileId);
            }, 2000);

            return fileData;
          })
          .catch((error: any) => {
            console.error(`Failed to upload ${file.name}:`, error);
            addToast({
              type: 'error',
              message: 'Upload failed',
              description: `Failed to upload ${file.name}`,
            });
            throw error;
          });
      });

      return Promise.allSettled(uploadPromises);
    },
    [addFile, setUploadProgress, removeUploadProgress, addToast]
  );

  /**
   * Download file
   */
  const downloadFile = useCallback(
    async (fileId: string) => {
      try {
        await FileService.downloadFileToDevice(fileId);
        addToast({
          type: 'success',
          message: 'Download started',
          description: 'File download has started',
        });
      } catch (error: any) {
        console.error('Failed to download file:', error);
        addToast({
          type: 'error',
          message: 'Download failed',
          description: error.message || 'Failed to download file',
        });
      }
    },
    [addToast]
  );

  /**
   * Delete file(s)
   */
  const deleteFiles = useCallback(
    async (fileIds: string[]) => {
      try {
        await Promise.all(fileIds.map((id) => FileService.deleteFile(id)));
        removeFiles(fileIds);
        clearSelection();

        addToast({
          type: 'success',
          message: `${fileIds.length} file(s) deleted`,
          description: 'Files deleted successfully',
        });
      } catch (error: any) {
        console.error('Failed to delete files:', error);
        addToast({
          type: 'error',
          message: 'Delete failed',
          description: error.message || 'Failed to delete files',
        });
      }
    },
    [removeFiles, clearSelection, addToast]
  );

  /**
   * Rename file
   */
  const renameFile = useCallback(
    async (fileId: string, newName: string) => {
      try {
        const updatedFile = await FileService.renameFile(fileId, newName);

        // Update the file in the store
        const fileIndex = files.findIndex(f => f.id === fileId);
        if (fileIndex !== -1) {
          const updatedFiles = [...files];
          updatedFiles[fileIndex] = {
            ...updatedFiles[fileIndex],
            name: updatedFile.name,
            updatedAt: updatedFile.updatedAt,
          };
          setFiles(updatedFiles);
        }

        addToast({
          type: 'success',
          message: 'File renamed',
          description: `Renamed to ${newName}`,
        });
      } catch (error: any) {
        console.error('Failed to rename file:', error);
        addToast({
          type: 'error',
          message: 'Rename failed',
          description: error.message || 'Failed to rename file',
        });
      }
    },
    [files, setFiles, addToast]
  );

  /**
   * Create folder
   */
  const createFolder = useCallback(
    async (name: string, parentId?: string) => {
      try {
        const folder = await FileService.createFolder(name, parentId);
        addFolder({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId || null,
          userId: '',
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        });

        addToast({
          type: 'success',
          message: 'Folder created',
          description: `${name} created successfully`,
        });

        return folder;
      } catch (error: any) {
        console.error('Failed to create folder:', error);
        addToast({
          type: 'error',
          message: 'Create folder failed',
          description: error.message || 'Failed to create folder',
        });
        throw error;
      }
    },
    [addFolder, addToast]
  );

  /**
   * Delete folder
   */
  const deleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await FileService.deleteFolder(folderId);
        removeFolder(folderId);

        addToast({
          type: 'success',
          message: 'Folder deleted',
          description: 'Folder deleted successfully',
        });
      } catch (error: any) {
        console.error('Failed to delete folder:', error);
        addToast({
          type: 'error',
          message: 'Delete folder failed',
          description: error.message || 'Failed to delete folder',
        });
      }
    },
    [removeFolder, addToast]
  );

  /**
   * Rename folder
   */
  const renameFolder = useCallback(
    async (folderId: string, newName: string) => {
      try {
        const updatedFolder = await FileService.renameFolder(folderId, newName);

        // Update the folder in the store
        const folderIndex = folders.findIndex(f => f.id === folderId);
        if (folderIndex !== -1) {
          const updatedFolders = [...folders];
          updatedFolders[folderIndex] = {
            ...updatedFolders[folderIndex],
            name: updatedFolder.name,
            updatedAt: updatedFolder.updatedAt,
          };
          setFolders(updatedFolders);
        }

        addToast({
          type: 'success',
          message: 'Folder renamed',
          description: `Renamed to ${newName}`,
        });
      } catch (error: any) {
        console.error('Failed to rename folder:', error);
        addToast({
          type: 'error',
          message: 'Rename failed',
          description: error.message || 'Failed to rename folder',
        });
      }
    },
    [folders, setFolders, addToast]
  );

  /**
   * Navigate to folder
   */
  const navigateToFolder = useCallback(
    (folderId: string | null) => {
      setCurrentFolder(folderId);
      loadFiles(folderId || undefined);
      clearSelection();
    },
    [setCurrentFolder, loadFiles, clearSelection]
  );

  // Load files when current folder changes
  useEffect(() => {
    loadFiles(currentFolderId || undefined);
  }, [currentFolderId]);

  return {
    // State
    files,
    folders,
    currentFolderId,
    selectedFileIds,
    uploadProgress,
    isLoading,

    // File actions
    loadFiles,
    uploadFiles,
    downloadFile,
    deleteFiles,
    renameFile,

    // Folder actions
    createFolder,
    deleteFolder,
    renameFolder,
    navigateToFolder,

    // Selection actions
    selectFile,
    deselectFile,
    toggleFileSelection,
    selectAllFiles,
    clearSelection,
  };
};
