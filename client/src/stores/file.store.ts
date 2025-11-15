import { create } from 'zustand';

export interface FileItem {
  id: string;
  name: string;
  encryptedName: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  isFolder?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'uploading' | 'encrypting' | 'complete' | 'error';
  error?: string;
}

interface FileState {
  // State
  files: FileItem[];
  folders: Folder[];
  currentFolderId: string | null;
  selectedFileIds: Set<string>;
  uploadProgress: Map<string, UploadProgress>;
  isLoading: boolean;

  // Actions
  setFiles: (files: FileItem[]) => void;
  addFile: (file: FileItem) => void;
  updateFile: (fileId: string, updates: Partial<FileItem>) => void;
  removeFile: (fileId: string) => void;
  removeFiles: (fileIds: string[]) => void;

  setFolders: (folders: Folder[]) => void;
  addFolder: (folder: Folder) => void;
  updateFolder: (folderId: string, updates: Partial<Folder>) => void;
  removeFolder: (folderId: string) => void;

  setCurrentFolder: (folderId: string | null) => void;

  selectFile: (fileId: string) => void;
  deselectFile: (fileId: string) => void;
  toggleFileSelection: (fileId: string) => void;
  selectAllFiles: () => void;
  clearSelection: () => void;

  setUploadProgress: (fileId: string, progress: UploadProgress) => void;
  removeUploadProgress: (fileId: string) => void;
  clearUploadProgress: () => void;

  setLoading: (isLoading: boolean) => void;
  reset: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  // Initial state
  files: [],
  folders: [],
  currentFolderId: null,
  selectedFileIds: new Set(),
  uploadProgress: new Map(),
  isLoading: false,

  // File actions
  setFiles: (files) => set({ files }),

  addFile: (file) =>
    set((state) => ({
      files: [...state.files, file],
    })),

  updateFile: (fileId, updates) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.id === fileId ? { ...file, ...updates } : file
      ),
    })),

  removeFile: (fileId) =>
    set((state) => ({
      files: state.files.filter((file) => file.id !== fileId),
      selectedFileIds: new Set(
        Array.from(state.selectedFileIds).filter((id) => id !== fileId)
      ),
    })),

  removeFiles: (fileIds) =>
    set((state) => ({
      files: state.files.filter((file) => !fileIds.includes(file.id)),
      selectedFileIds: new Set(
        Array.from(state.selectedFileIds).filter((id) => !fileIds.includes(id))
      ),
    })),

  // Folder actions
  setFolders: (folders) => set({ folders }),

  addFolder: (folder) =>
    set((state) => ({
      folders: [...state.folders, folder],
    })),

  updateFolder: (folderId, updates) =>
    set((state) => ({
      folders: state.folders.map((folder) =>
        folder.id === folderId ? { ...folder, ...updates } : folder
      ),
    })),

  removeFolder: (folderId) =>
    set((state) => ({
      folders: state.folders.filter((folder) => folder.id !== folderId),
    })),

  setCurrentFolder: (folderId) => set({ currentFolderId: folderId }),

  // Selection actions
  selectFile: (fileId) =>
    set((state) => ({
      selectedFileIds: new Set(state.selectedFileIds).add(fileId),
    })),

  deselectFile: (fileId) =>
    set((state) => {
      const newSet = new Set(state.selectedFileIds);
      newSet.delete(fileId);
      return { selectedFileIds: newSet };
    }),

  toggleFileSelection: (fileId) =>
    set((state) => {
      const newSet = new Set(state.selectedFileIds);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return { selectedFileIds: newSet };
    }),

  selectAllFiles: () =>
    set((state) => ({
      selectedFileIds: new Set(state.files.map((file) => file.id)),
    })),

  clearSelection: () => set({ selectedFileIds: new Set() }),

  // Upload progress actions
  setUploadProgress: (fileId, progress) =>
    set((state) => {
      const newProgress = new Map(state.uploadProgress);
      newProgress.set(fileId, progress);
      return { uploadProgress: newProgress };
    }),

  removeUploadProgress: (fileId) =>
    set((state) => {
      const newProgress = new Map(state.uploadProgress);
      newProgress.delete(fileId);
      return { uploadProgress: newProgress };
    }),

  clearUploadProgress: () => set({ uploadProgress: new Map() }),

  setLoading: (isLoading) => set({ isLoading }),

  reset: () =>
    set({
      files: [],
      folders: [],
      currentFolderId: null,
      selectedFileIds: new Set(),
      uploadProgress: new Map(),
      isLoading: false,
    }),
}));
