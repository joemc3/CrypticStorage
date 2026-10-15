/**
 * CrypticStorage - Files Page
 * Folder navigation, upload, download, preview, sharing and deletion.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpTrayIcon, FolderPlusIcon, TrashIcon, ArrowDownTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { FileList } from '../components/files/FileList';
import { FileUpload } from '../components/files/FileUpload';
import { FilePreview } from '../components/files/FilePreview';
import { ShareDialog, type ShareLink as DialogShareLink, type ShareOptions, type UserShareRow } from '../components/files/ShareDialog';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { EmptyState } from '../components/common/EmptyState';
import { ListRow, RowList } from '../components/common/ListRow';
import { formatDate } from '../components/files/FileItem';
import { useFiles } from '../hooks/useFiles';
import { useUIStore } from '../stores/ui.store';
import FileService, { formatFileSize } from '../services/file.service';
import ShareService, { type ShareLinkWithKey } from '../services/share.service';
import ApiService, { toApiError } from '../services/api.service';
import { lookupContact, setContactVerified } from '../services/witness.service';
import { countFilesUnder, isOpen } from '../services/rules.service';
import { useRules } from '../hooks/useRules';
import { RuleFlows, type FlowIntent } from '../components/handoff/RuleFlows';
import { FolderRuleBanner, FromHandoffMarker, HandoffMarker, ShareMarker } from '../components/handoff/Markers';

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
  const {
    files,
    folders,
    breadcrumbs,
    sharedWithMe,
    selectedFileIds,
    uploadProgress,
    isLoading,
    loadFiles,
    loadSharedWithMe,
    uploadFiles,
    downloadFile,
    deleteFiles,
    createFolder,
    deleteFolder,
    toggleFileSelection,
  } = useFiles();
  const addToast = useUIStore((s) => s.addToast);
  const rules = useRules();
  const [flow, setFlow] = useState<FlowIntent | null>(null);

  const currentFolderId = routeFolderId ?? null;
  const [newFolderName, setNewFolderName] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);
  const [keyChangedFor, setKeyChangedFor] = useState<string | null>(null);
  const [existingLinks, setExistingLinks] = useState<DialogShareLink[]>([]);
  const [userShares, setUserShares] = useState<UserShareRow[]>([]);
  // Which file the share dialog is for right now. Late responses for another file are dropped.
  const shareTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (view === 'shared') {
      void loadSharedWithMe();
      return;
    }
    void loadFiles(currentFolderId);
  }, [view, currentFolderId, loadFiles, loadSharedWithMe]);

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

  const handleDeleteFolder = async (id: string) => {
    const name = folders.find((f) => f.id === id)?.name ?? 'this folder';
    if (window.confirm(`Delete folder "${name}" and everything inside it?`)) await deleteFolder(id);
  };

  const loadUserShares = async (fileId: string) => {
    try {
      const shares = await ShareService.listUserShares(fileId);
      if (shareTargetRef.current !== fileId) return;
      setUserShares(shares.map((s) => ({ id: s.id, email: s.recipientEmail ?? 'Unknown account' })));
    } catch {
      if (shareTargetRef.current === fileId) setUserShares([]);
    }
  };

  const openShare = async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    shareTargetRef.current = fileId;
    setShareTarget({ id: file.id, name: file.name });
    setUserShares([]);
    setExistingLinks([]);
    try {
      const links = (await ShareService.listShareLinks(fileId)).map(toDialogLink);
      if (shareTargetRef.current === fileId) setExistingLinks(links);
    } catch {
      if (shareTargetRef.current === fileId) setExistingLinks([]);
    }
    void loadUserShares(fileId);
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

  const lookupRecipient = async (email: string) => {
    const normalised = email.trim().toLowerCase();
    setKeyChangedFor(null);
    try {
      const found = await lookupContact(normalised);
      if (found.keyChanged) setKeyChangedFor(normalised);
      return {
        id: found.id,
        email: normalised,
        publicKey: found.publicKey,
        fingerprint: found.localFingerprint,
        keyChanged: found.keyChanged,
        verifiedInPerson: found.verifiedInPerson,
      };
    } catch (error) {
      throw new Error(toApiError(error).message);
    }
  };

  const setRecipientVerified = async (recipient: { id?: string }, verified: boolean) => {
    if (!recipient.id) return;
    await setContactVerified(recipient.id, verified);
    // Marking a changed key as checked re-trusts it; the server stores the key now in use.
    if (verified) setKeyChangedFor(null);
  };

  const shareWithUser = async (email: string, publicKey?: string) => {
    if (!shareTarget) return;
    try {
      await ShareService.shareWithUser(shareTarget.id, email, publicKey);
      addToast({ type: 'success', message: `Shared with ${email}` });
      await loadUserShares(shareTarget.id);
    } catch (error) {
      addToast({ type: 'error', message: 'Could not share', description: error instanceof Error ? error.message : undefined });
      throw error;
    }
  };

  const revokeUserShare = async (shareId: string) => {
    if (!shareTarget) return;
    try {
      await ShareService.revokeUserShare(shareId);
      await loadUserShares(shareTarget.id);
    } catch (error) {
      addToast({ type: 'error', message: 'Could not remove access', description: error instanceof Error ? error.message : undefined });
    }
  };

  const decryptForPreview = useCallback(async (fileId: string): Promise<string> => {
    const file = await FileService.downloadFile(fileId);
    return URL.createObjectURL(file.blob);
  }, []);

  const handOffFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    if (file) setFlow({ kind: 'create', item: { target: { fileId: id }, name: file.name, detail: formatFileSize(file.size) } });
  };

  const handOffFolder = async (id: string) => {
    const name = folders.find((f) => f.id === id)?.name ?? breadcrumbs.find((c) => c.id === id)?.name ?? 'Folder';
    let count: number | null = null;
    try {
      count = await countFilesUnder(id);
    } catch {
      // The sheet still opens; it just cannot say how many files.
    }
    setFlow({ kind: 'create', item: { target: { folderId: id }, name, detail: count === null ? 'Folder' : `Folder · ${count} ${count === 1 ? 'file' : 'files'}` } });
  };

  const showRules = (name: string, list: typeof rules.rules, addTo?: Extract<FlowIntent, { kind: 'create' }>['item']) =>
    setFlow({ kind: 'detail', itemName: name, rules: list, addTo });

  const currentFolder = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1]! : null;
  const bannerRules = currentFolder ? rules.rules.filter((r) => isOpen(r) && currentFolder.ruleIds?.includes(r.id)) : [];

  const previewFile = previewId ? files.find((f) => f.id === previewId) ?? null : null;
  const uploads = Array.from(uploadProgress.values());

  const downloadShared = async (shareId: string) => {
    try {
      const shared = (await ApiService.getSharedWithMe()).find((s) => s.shareId === shareId);
      if (!shared) throw new Error('Share no longer available');
      const decrypted = await FileService.downloadSharedFile(shared);
      FileService.saveBlob(decrypted.blob, decrypted.name);
    } catch (error) {
      addToast({ type: 'error', message: 'Download failed', description: error instanceof Error ? error.message : undefined });
    }
  };

  if (view === 'shared') {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-sans text-2xl font-semibold leading-[30px] tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]">Shared with me</h1>
            <p className="text-sm text-ink-2">You open these with your own login. Nobody sent you a second secret.</p>
          </div>

          {sharedWithMe.length === 0 ? (
            <EmptyState title="Nothing has been shared with you yet." body="Files that other people share with this account appear here." />
          ) : (
            <section aria-label="Items" className="flex flex-col gap-3">
              <RowList>
                {sharedWithMe.map((file) => (
                  <ListRow
                    key={file.shareId}
                    icon={<DocumentTextIcon className="h-5 w-5" />}
                    title={file.name}
                    meta={<span className="break-all">{`From ${file.sharedBy} · ${formatDate(file.createdAt)} · ${formatFileSize(file.size)}`}</span>}
                    markers={file.handoff ? <FromHandoffMarker from={file.handoff.from} witnesses={file.handoff.by === 'quorum' ? file.handoff.witnesses : undefined} /> : null}
                    actions={
                      <button
                        type="button"
                        onClick={() => void downloadShared(file.shareId)}
                        aria-label={`Download ${file.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    }
                  />
                ))}
              </RowList>
            </section>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const crumbs = [
    { label: 'Files', href: '/files', onClick: () => goTo(null) },
    ...breadcrumbs.map((crumb) => ({ label: crumb.name, href: `/files/${crumb.id}`, onClick: () => goTo(crumb.id) })),
  ];
  const title = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1]!.name : 'Files';

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
        {currentFolderId && <Breadcrumbs items={crumbs} />}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="min-w-0 break-words font-sans text-2xl font-semibold leading-[30px] tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]">{title}</h1>
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateFolder(true)} variant="secondary" size="sm" leftIcon={<FolderPlusIcon className="h-4 w-4" />}>
              New folder
            </Button>
            <Button onClick={() => setShowUpload(true)} size="sm" leftIcon={<ArrowUpTrayIcon className="h-4 w-4" />}>
              Upload
            </Button>
          </div>
        </div>

        {currentFolder && bannerRules.length > 0 && (
          <FolderRuleBanner
            rules={bannerRules}
            onView={() => showRules(currentFolder.name, bannerRules, { target: { folderId: currentFolder.id }, name: currentFolder.name, detail: 'Folder' })}
          />
        )}

        {uploads.length > 0 && !showUpload && (
          <div role="status" className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm">
            {uploads.map((u) => (
              <div key={u.fileId} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ink">{u.fileName}</span>
                <span className={`flex-none ${u.status === 'error' ? 'text-danger-text' : 'text-ink-3'}`}>
                  {u.status === 'error' ? u.error ?? 'Upload failed' : u.status === 'complete' ? 'Encrypted and stored' : `${u.status === 'encrypting' ? 'Encrypting' : 'Uploading'} · ${Math.round(u.progress)}%`}
                </span>
              </div>
            ))}
          </div>
        )}

        {selectedFileIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3">
            <span className="text-sm font-medium text-accent-text">{selectedFileIds.size} selected</span>
            <Button variant="danger" size="sm" onClick={() => void handleDeleteSelected()} leftIcon={<TrashIcon className="h-4 w-4" />}>
              Delete
            </Button>
          </div>
        )}

        <FileList
          files={files.map((f) => {
            const own = rules.byFile.get(f.id);
            return {
              id: f.id,
              name: f.name,
              size: f.size,
              mimeType: f.mimeType,
              uploadedAt: f.createdAt,
              shareMarker: (f.shareCount ?? 0) > 0 ? <ShareMarker /> : undefined,
              handoffMarker: own ? <HandoffMarker rules={own} /> : undefined,
              onRules: own ? () => showRules(f.name, own, { target: { fileId: f.id }, name: f.name, detail: formatFileSize(f.size) }) : undefined,
            };
          })}
          folders={folders.map((f) => {
            const own = rules.byFolder.get(f.id);
            return {
              id: f.id,
              name: f.name,
              marker: own ? <HandoffMarker rules={own} /> : undefined,
              onRules: own ? () => showRules(f.name, own, { target: { folderId: f.id }, name: f.name, detail: 'Folder' }) : undefined,
            };
          })}
          onFileHandoff={handOffFile}
          onFolderHandoff={(id) => void handOffFolder(id)}
          isLoading={isLoading}
          emptyMessage={currentFolderId ? 'Nothing in this folder yet.' : 'Nothing in your safe yet.'}
          selectedIds={selectedFileIds}
          onToggleSelect={toggleFileSelection}
          onFolderOpen={(id) => goTo(id)}
          onFolderDelete={(id) => void handleDeleteFolder(id)}
          onFileClick={(id) => setPreviewId(id)}
          onFileDownload={(id) => void downloadFile(id)}
          onFileDelete={(id) => {
            const name = files.find((f) => f.id === id)?.name ?? 'this file';
            if (window.confirm(`Delete "${name}"? This cannot be undone.`)) void deleteFiles([id]);
          }}
          onFileShare={(id) => void openShare(id)}
        />

        <p className="flex items-center gap-2 text-sm text-ink-3">
          <ArrowUpTrayIcon className="h-4 w-4 flex-none" aria-hidden="true" />
          Files are encrypted before they leave this browser.
        </p>

        <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload files" size="lg">
          <FileUpload onUpload={handleUpload} uploads={uploads} />
        </Modal>

        <Modal isOpen={showCreateFolder} onClose={() => setShowCreateFolder(false)} title="New folder" size="sm">
          <div className="flex flex-col gap-4">
            <Input
              label="Folder name"
              aria-label="Folder name"
              placeholder="e.g. Tax documents"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateFolder();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="quiet" onClick={() => setShowCreateFolder(false)}>
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

        <RuleFlows intent={flow} onClose={() => setFlow(null)} onChanged={() => void rules.reload()} />

        <ShareDialog
          isOpen={shareTarget !== null}
          onClose={() => {
            shareTargetRef.current = null;
            setShareTarget(null);
            setKeyChangedFor(null);
          }}
          file={shareTarget}
          onCreateShare={createShare}
          existingShares={existingLinks}
          onLookupRecipient={lookupRecipient}
          onShareWithUser={shareWithUser}
          userShares={userShares}
          onRevokeUserShare={revokeUserShare}
          keyChangedFor={keyChangedFor}
          onSetVerified={setRecipientVerified}
        />
      </div>
    </DashboardLayout>
  );
};

export default FilesPage;
