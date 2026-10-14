/**
 * CrypticStorage - API Service
 * Typed HTTP client for the CrypticStorage API. Every field that starts with
 * "encrypted" or "wrapped" is ciphertext produced by crypto.service.
 */

import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import StorageService from './storage.service';

// ============================================================================
// Types
// ============================================================================

export interface ApiError {
  message: string;
  statusCode: number;
  code?: string;
  errors?: Record<string, string[]>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  publicKey: string;
  storageUsed: number;
  storageLimit: number;
  twoFactorEnabled: boolean;
  displayName: string | null;
  lockAfterMinutes: number;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultUser extends UserProfile {
  encryptedPrivateKey: string;
  wrappedMasterKey: string;
  salt: string;
  kdfIterations: number;
}

export interface RegisterRequest {
  email: string;
  passwordHash: string;
  publicKey: string;
  encryptedPrivateKey: string;
  wrappedMasterKey: string;
  salt: string;
  kdfIterations: number;
  contractPhrase: string;
  displayName?: string;
}

export interface RegisterResponse {
  verificationRequired: true;
}

export interface AuthResponse {
  user: VaultUser;
  tokens: Tokens;
  requiresTwoFactor?: boolean;
}

export interface UpdateProfileRequest {
  displayName?: string | null;
  lockAfterMinutes?: number;
  currentPasswordHash?: string;
  newPasswordHash?: string;
  salt?: string;
  kdfIterations?: number;
  wrappedMasterKey?: string;
  encryptedPrivateKey?: string;
}

export interface FileMetadata {
  id: string;
  userId: string;
  folderId?: string;
  encryptedName: string;
  encryptedNameIV: string;
  encryptedFileKey: string;
  fileKeyIV: string;
  iv: string;
  encryptedSize: number;
  mimeType: string;
  status: 'PENDING' | 'READY';
  createdAt: string;
  updatedAt: string;
  /** Active user shares plus unexpired, unrevoked links. Present on listings and `getFile`. */
  shareCount?: number;
}

export interface SharedFileMetadata extends FileMetadata {
  shareId: string;
  permissions: string;
  expiresAt?: string;
  sharedBy: { id: string; email: string };
  /**
   * Present when the file reached the caller through a released handoff rule. `encryptedFileKey` is then empty:
   * the client unwraps `wrappedFileKey` with the release key (itself unwrapped from `wrappedReleaseKey`).
   */
  handoff?: {
    ruleId: string;
    from: { id: string; email: string; displayName: string | null };
    releasedAt: string;
    by: 'timer' | 'quorum';
    /** Only after a timer release. */
    wrappedReleaseKey?: string;
    /** Only after a quorum release: the shares the voting witnesses re-wrapped for the caller. Combine k of them to get the release key. */
    voteShares?: HandoffVoteShare[];
    wrappedFileKey: string;
  };
}

export interface UploadRequest {
  encryptedName: string;
  encryptedNameIV: string;
  encryptedFileKey: string;
  fileKeyIV: string;
  iv: string;
  encryptedSize: number;
  mimeType: string;
  folderId?: string;
}

export interface UploadUrlResponse {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  method: 'PUT';
  expiresIn: number;
}

export interface FolderMetadata {
  id: string;
  userId: string;
  parentId?: string;
  encryptedName: string;
  encryptedNameIV: string;
  createdAt: string;
  updatedAt: string;
  /** Files under this folder that an active handoff rule covers but has no wrapped key for yet. Present on get and list. */
  coverageGaps?: number;
  /** Active or warning handoff rules on this folder or any ancestor. Present on get and list. */
  ruleIds?: string[];
}

export interface ShareLink {
  id: string;
  fileId: string;
  token: string;
  url: string;
  passwordProtected: boolean;
  expiresAt?: string;
  maxDownloads?: number;
  downloadCount: number;
  revokedAt?: string;
  createdAt: string;
}

export interface PublicShareInfo {
  token: string;
  fileId: string;
  encryptedName: string;
  encryptedNameIV: string;
  encryptedSize: number;
  mimeType: string;
  iv: string;
  passwordProtected: boolean;
  expiresAt?: string;
  downloadsRemaining?: number;
  sharedBy: string;
}

export interface UserShare {
  id: string;
  fileId: string;
  ownerId: string;
  recipientId: string;
  recipientEmail?: string;
  permissions: string;
  expiresAt?: string;
  createdAt: string;
}

export interface StorageStats {
  used: number;
  limit: number;
  fileCount: number;
  folderCount: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  createdAt: string;
}

export type ProgressHandler = (loaded: number, total: number) => void;

// ============================================================================
// Client
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// --- Witnesses and key trust ---------------------------------------------------

export type WitnessStatus = 'invited' | 'accepted' | 'declined' | 'removed';

export interface WitnessEntry {
  id: string;
  user: { id: string; email: string; displayName: string | null; publicKey: string; fingerprint: string };
  status: WitnessStatus;
  invitedAt: string;
  respondedAt: string | null;
}

export interface WitnessSet {
  threshold: number;
  minN: number;
  maxN: number;
  witnesses: WitnessEntry[];
}

export interface WitnessInvitation {
  id: string;
  owner: { id: string; email: string; displayName: string | null };
  status: WitnessStatus;
  invitedAt: string;
  respondedAt: string | null;
}

export interface WitnessInvitations {
  invitations: Array<{ id: string; owner: WitnessInvitation['owner']; invitedAt: string }>;
  serving: Array<{ id: string; owner: WitnessInvitation['owner']; respondedAt: string | null }>;
}

// --- Handoff rules -------------------------------------------------------------

export type HandoffRuleState = 'active' | 'warning' | 'released_timer' | 'released_quorum' | 'revoked';

export interface HandoffRecipient {
  userId: string;
  email: string;
  displayName: string | null;
  notifiedAt: string | null;
}

export interface HandoffRule {
  id: string;
  fileId?: string;
  folderId?: string;
  periodDays: number;
  state: HandoffRuleState;
  createdAt: string;
  /** Null once the rule is released or revoked. */
  nextCheckInAt: string | null;
  /** When the first reminder goes out (75 % of the period); null once the rule is no longer open. */
  warningAt: string | null;
  /** True when the witness set changed and the shares must be re-split (the client repairs at unlock). */
  sharesStale: boolean;
  /** Ready files under the target that have no wrapped key in the rule yet. */
  coverageGaps: number;
  recipients: HandoffRecipient[];
  releasedAt?: string;
  revokedAt?: string;
}

export interface HandoffRuleDetail extends HandoffRule {
  /** Ids only. The owner holds their own file keys. */
  items: Array<{ fileId: string }>;
  /** Release key wrapped under the owner's master key (opaque client blob). */
  wrappedReleaseKeyOwner: string;
}

export interface HandoffShareInput {
  witnessUserId: string;
  shareIndex: number;
  wrappedShare: string;
}

export interface HandoffItemInput {
  fileId: string;
  wrappedFileKey: string;
}

export interface CreateHandoffRuleRequest {
  fileId?: string;
  folderId?: string;
  periodDays: number;
  recipients: Array<{ userId: string; wrappedReleaseKey: string }>;
  items: HandoffItemInput[];
  shares: HandoffShareInput[];
  wrappedReleaseKeyOwner: string;
}

export interface HandoffVoteShare {
  witnessUserId: string;
  /** A Shamir share, RSA-OAEP wrapped under the recipient's public key. */
  wrappedShare: string;
}

export interface HandoffForMe {
  id: string;
  owner: { id: string; email: string; displayName: string | null };
  state: Exclude<HandoffRuleState, 'revoked'>;
  createdAt: string;
  releasedAt?: string;
  releasedBy?: 'timer' | 'quorum';
  /** Only after a timer release. */
  wrappedReleaseKey?: string;
  /** Only after a quorum release: every share re-wrapped for the caller by the request that released the rule. */
  voteShares?: HandoffVoteShare[];
  /** After a timer or quorum release. `file.encryptedFileKey` is empty; use `wrappedFileKey`. */
  items?: Array<{ fileId: string; wrappedFileKey: string; file: FileMetadata }>;
}

// --- Release requests (quorum) --------------------------------------------------

export type ReleaseRequestState = 'open' | 'cancelled' | 'completed';

export interface ReleasePerson {
  id: string;
  email: string;
  displayName: string | null;
}

export interface ReleaseRequestRule {
  ruleId: string;
  /** A stale rule cannot be voted on until the owner re-splits it; leave it out of the vote. */
  sharesStale: boolean;
  state: 'active' | 'warning';
  /** The people to re-wrap this rule's share for. */
  recipients: Array<{ userId: string; publicKey: string }>;
}

export interface ReleaseRequest {
  id: string;
  owner: ReleasePerson;
  openedBy: ReleasePerson;
  state: ReleaseRequestState;
  /** The owner's threshold when the request opened. */
  requiredVotes: number;
  openedAt: string;
  closedAt?: string;
  votes: Array<{ witnessUserId: string; displayName: string | null; email: string; votedAt: string }>;
  myVote: boolean;
  /** Open requests only: the owner's active and warning rules now. */
  rules: ReleaseRequestRule[];
  /** Open requests only: the caller's own wrapped share for each non-stale rule. Unwrap, then re-wrap per recipient. */
  myShares: Array<{ ruleId: string; shareIndex: number; wrappedShare: string }>;
}

export interface ReleaseVoteShareInput {
  ruleId: string;
  recipientUserId: string;
  /** The caller's share for the rule, re-wrapped under this recipient's public key. */
  wrappedShare: string;
}

export interface ReleaseVoteResult extends ReleaseRequest {
  /** Rules left out of the vote because their shares are stale. They stay active. */
  awaitingRepair: string[];
}

export interface ActiveRuleRef {
  id: string;
  sharesStale: boolean;
}

export interface TrustedKey {
  fingerprint: string;
  verifiedInPerson: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface PublicKeyLookup {
  id: string;
  email: string;
  publicKey: string;
  /** SHA-256 of the SPKI bytes, lowercase hex, computed by the server. */
  fingerprint: string;
  /** The caller's stored row for this contact, or null if never recorded. */
  trust: TrustedKey | null;
}

class ApiService {
  private readonly client: AxiosInstance;
  private refreshing: Promise<Tokens> | null = null;

  constructor() {
    this.client = axios.create({ baseURL: API_BASE_URL, timeout: 30_000, headers: { 'Content-Type': 'application/json' } });

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = StorageService.getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
        const isAuthRoute = original?.url?.startsWith('/auth/') ?? false;
        if (error.response?.status === 401 && original && !original._retried && !isAuthRoute) {
          const refreshToken = StorageService.getRefreshToken();
          if (refreshToken) {
            try {
              const tokens = await this.refreshOnce(refreshToken);
              original._retried = true;
              original.headers.Authorization = `Bearer ${tokens.accessToken}`;
              return this.client(original);
            } catch {
              StorageService.clearAllData();
              window.dispatchEvent(new CustomEvent('cs:session-expired'));
            }
          }
        }
        return Promise.reject(toApiError(error));
      }
    );
  }

  private refreshOnce(refreshToken: string): Promise<Tokens> {
    if (!this.refreshing) {
      this.refreshing = this.refresh(refreshToken)
        .then((tokens) => {
          StorageService.setTokens({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: Date.now() + tokens.expiresIn * 1000 });
          return tokens;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  private async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return (await this.client.get<ApiResponse<T>>(url, { params })).data.data;
  }
  private async post<T>(url: string, body?: unknown): Promise<T> {
    return (await this.client.post<ApiResponse<T>>(url, body)).data.data;
  }
  private async patch<T>(url: string, body?: unknown): Promise<T> {
    return (await this.client.patch<ApiResponse<T>>(url, body)).data.data;
  }
  private async put<T>(url: string, body?: unknown): Promise<T> {
    return (await this.client.put<ApiResponse<T>>(url, body)).data.data;
  }
  private async delete<T>(url: string, body?: unknown): Promise<T> {
    return (await this.client.delete<ApiResponse<T>>(url, { data: body })).data.data;
  }

  // --- Auth ------------------------------------------------------------------

  register(data: RegisterRequest): Promise<RegisterResponse> {
    return this.post('/auth/register', data);
  }
  verifyEmail(token: string): Promise<{ email: string }> {
    return this.post('/auth/verify-email', { token });
  }
  async resendVerification(email: string): Promise<void> {
    await this.post('/auth/resend-verification', { email });
  }
  login(email: string, passwordHash: string): Promise<AuthResponse> {
    return this.post('/auth/login', { email, passwordHash });
  }
  /** The link in a reminder email. Public: the token is the proof. */
  checkIn(token: string): Promise<{ ok: true }> {
    return this.post('/auth/check-in', { token });
  }

  verifyTwoFactor(data: { token?: string; backupCode?: string }): Promise<AuthResponse> {
    return this.post('/auth/verify-2fa', data);
  }
  refresh(refreshToken: string): Promise<Tokens> {
    return this.post('/auth/refresh', { refreshToken });
  }
  logout(): Promise<unknown> {
    return this.post('/auth/logout');
  }

  // --- Users -----------------------------------------------------------------

  getProfile(): Promise<UserProfile> {
    return this.get('/users/profile');
  }
  updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
    return this.patch('/users/profile', data);
  }
  deleteAccount(passwordHash: string): Promise<unknown> {
    return this.delete('/users/profile', { passwordHash });
  }
  getPublicKey(email: string): Promise<PublicKeyLookup> {
    return this.get('/users/public-key', { email });
  }
  /** Record that this contact's current key was seen (first use, or a fetch whose fingerprint matched). */
  markContactSeen(userId: string): Promise<TrustedKey> {
    return this.post(`/contacts/${userId}/seen`);
  }
  setContactTrust(userId: string, verifiedInPerson: boolean): Promise<TrustedKey> {
    return this.put(`/contacts/${userId}/trust`, { verifiedInPerson });
  }

  // --- Witnesses ---------------------------------------------------------------

  getWitnesses(): Promise<WitnessSet> {
    return this.get('/witnesses');
  }
  setWitnessThreshold(k: number): Promise<WitnessSet & { activeRules: ActiveRuleRef[] }> {
    return this.put('/witnesses/threshold', { k });
  }
  inviteWitness(email: string): Promise<WitnessEntry> {
    return this.post('/witnesses', { email });
  }
  removeWitness(id: string): Promise<{ threshold: number; activeRules: ActiveRuleRef[] }> {
    return this.delete(`/witnesses/${id}`);
  }
  getWitnessInvitations(): Promise<WitnessInvitations> {
    return this.get('/witnesses/invitations');
  }
  acceptWitnessInvitation(id: string): Promise<WitnessInvitation> {
    return this.post(`/witnesses/invitations/${id}/accept`);
  }
  declineWitnessInvitation(id: string): Promise<WitnessInvitation> {
    return this.post(`/witnesses/invitations/${id}/decline`);
  }
  // --- Handoff rules -----------------------------------------------------------

  createHandoffRule(input: CreateHandoffRuleRequest): Promise<HandoffRuleDetail> {
    return this.post('/handoff/rules', input);
  }
  listHandoffRules(): Promise<HandoffRule[]> {
    return this.get('/handoff/rules');
  }
  getHandoffRule(id: string): Promise<HandoffRuleDetail> {
    return this.get(`/handoff/rules/${id}`);
  }
  revokeHandoffRule(id: string): Promise<HandoffRule> {
    return this.delete(`/handoff/rules/${id}`);
  }
  replaceHandoffShares(id: string, shares: HandoffShareInput[]): Promise<HandoffRuleDetail> {
    return this.put(`/handoff/rules/${id}/shares`, { shares });
  }
  addHandoffItems(id: string, items: HandoffItemInput[]): Promise<HandoffRuleDetail> {
    return this.put(`/handoff/rules/${id}/items`, { items });
  }
  openReleaseRequest(ownerId: string): Promise<ReleaseRequest> {
    return this.post('/handoff/requests', { ownerId });
  }
  listReleaseRequests(): Promise<ReleaseRequest[]> {
    return this.get('/handoff/requests');
  }
  voteOnReleaseRequest(id: string, shares: ReleaseVoteShareInput[]): Promise<ReleaseVoteResult> {
    return this.post(`/handoff/requests/${id}/votes`, { shares });
  }
  handoffForMe(): Promise<HandoffForMe[]> {
    return this.get('/handoff/for-me');
  }
  setupTwoFactor(): Promise<{ secret: string; qrCode: string }> {
    return this.post('/users/2fa/setup');
  }
  enableTwoFactor(token: string): Promise<{ backupCodes: string[] }> {
    return this.post('/users/2fa/enable', { token });
  }
  disableTwoFactor(token: string, passwordHash: string): Promise<unknown> {
    return this.post('/users/2fa/disable', { token, passwordHash });
  }
  regenerateBackupCodes(passwordHash: string): Promise<{ backupCodes: string[] }> {
    return this.post('/users/2fa/backup-codes', { passwordHash });
  }
  getStorageStats(): Promise<StorageStats> {
    return this.get('/storage/stats');
  }
  getActivity(page = 1, pageSize = 50): Promise<PaginatedResponse<ActivityEntry>> {
    return this.get('/activity', { page, pageSize });
  }

  // --- Files -----------------------------------------------------------------

  getFiles(folderId?: string): Promise<FileMetadata[]> {
    return this.get('/files', { folderId });
  }
  getFile(fileId: string): Promise<FileMetadata> {
    return this.get(`/files/${fileId}`);
  }
  createUploadUrl(data: UploadRequest): Promise<UploadUrlResponse> {
    return this.post('/files/upload-url', data);
  }
  async uploadContent(uploadUrl: string, blob: Blob, onProgress?: ProgressHandler): Promise<void> {
    await axios.put(uploadUrl, blob, {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 0,
      onUploadProgress: (e) => onProgress?.(e.loaded, e.total ?? blob.size),
    });
  }
  confirmUpload(fileId: string): Promise<FileMetadata> {
    return this.post(`/files/${fileId}/confirm`);
  }
  getDownloadUrl(fileId: string): Promise<{ downloadUrl: string; expiresIn: number }> {
    return this.get(`/files/${fileId}/download-url`);
  }
  async downloadContent(downloadUrl: string, onProgress?: ProgressHandler): Promise<Blob> {
    // arraybuffer works in browsers and Node alike; 'blob' is browser-only.
    const res = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 0,
      onDownloadProgress: (e) => onProgress?.(e.loaded, e.total ?? e.loaded),
    });
    return new Blob([res.data], { type: 'application/octet-stream' });
  }
  updateFile(fileId: string, data: { encryptedName?: string; encryptedNameIV?: string; folderId?: string | null }): Promise<FileMetadata> {
    return this.patch(`/files/${fileId}`, data);
  }
  moveFile(fileId: string, folderId: string | null): Promise<FileMetadata> {
    return this.post(`/files/${fileId}/move`, { folderId });
  }
  copyFile(fileId: string, folderId?: string | null): Promise<FileMetadata> {
    return this.post(`/files/${fileId}/copy`, { folderId });
  }
  deleteFile(fileId: string): Promise<unknown> {
    return this.delete(`/files/${fileId}`);
  }

  // --- Folders ---------------------------------------------------------------

  getFolders(parentId?: string): Promise<FolderMetadata[]> {
    return this.get('/folders', { parentId });
  }
  getFolder(folderId: string): Promise<FolderMetadata> {
    return this.get(`/folders/${folderId}`);
  }
  createFolder(data: { encryptedName: string; encryptedNameIV: string; parentId?: string }): Promise<FolderMetadata> {
    return this.post('/folders', data);
  }
  updateFolder(folderId: string, data: { encryptedName?: string; encryptedNameIV?: string; parentId?: string | null }): Promise<FolderMetadata> {
    return this.patch(`/folders/${folderId}`, data);
  }
  moveFolder(folderId: string, parentId: string | null): Promise<FolderMetadata> {
    return this.post(`/folders/${folderId}/move`, { parentId });
  }
  deleteFolder(folderId: string): Promise<unknown> {
    return this.delete(`/folders/${folderId}`);
  }

  // --- Sharing ---------------------------------------------------------------

  createShareLink(data: { fileId: string; password?: string; expiresAt?: string; maxDownloads?: number }): Promise<ShareLink> {
    return this.post('/shares/links', data);
  }
  getFileShareLinks(fileId: string): Promise<ShareLink[]> {
    return this.get(`/files/${fileId}/links`);
  }
  revokeShareLink(linkId: string): Promise<unknown> {
    return this.delete(`/shares/links/${linkId}`);
  }
  getPublicShare(token: string): Promise<PublicShareInfo> {
    return this.get(`/shares/public/${token}`);
  }
  getPublicShareDownloadUrl(token: string, password?: string): Promise<{ downloadUrl: string; expiresIn: number }> {
    return this.post(`/shares/public/${token}/download-url`, { password });
  }
  shareWithUser(data: { fileId: string; recipientEmail: string; encryptedFileKey: string; permissions: 'read' | 'write'; expiresAt?: string }): Promise<UserShare> {
    return this.post('/shares', data);
  }
  getFileShares(fileId: string): Promise<UserShare[]> {
    return this.get(`/files/${fileId}/shares`);
  }
  revokeUserShare(shareId: string): Promise<unknown> {
    return this.delete(`/shares/${shareId}`);
  }
  getSharedWithMe(): Promise<SharedFileMetadata[]> {
    return this.get('/shares/with-me');
  }
}

export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const data = error.response.data as { message?: string; code?: string; errors?: Record<string, string[]> } | undefined;
      return { message: data?.message || error.message, statusCode: error.response.status, code: data?.code, errors: data?.errors };
    }
    return { message: 'Cannot reach the server. Check your connection.', statusCode: 0 };
  }
  if (error && typeof error === 'object' && 'statusCode' in error) return error as ApiError;
  return { message: error instanceof Error ? error.message : 'Unexpected error', statusCode: 0 };
}

export default new ApiService();
