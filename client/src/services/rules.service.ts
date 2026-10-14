/**
 * CrypticStorage - Rules Service
 *
 * The API-facing side of handoff rules. handoff.service.ts holds the pure cryptography;
 * this file gathers the keys, calls it, and sends the wrapped results in one request.
 * Nothing leaves this module as a raw key: only blobs wrapped under the master key, the
 * release key, a recipient's public key or a witness's public key.
 */

import CryptoService from './crypto.service';
import ApiService, {
  type CreateHandoffRuleRequest,
  type FileMetadata,
  type HandoffForMe,
  type HandoffItemInput,
  type HandoffRule,
  type HandoffRuleDetail,
  type HandoffShareInput,
  type WitnessEntry,
} from './api.service';
import StorageService from './storage.service';
import { fileKeyFor, getFolder } from './file.service';
import * as Handoff from './handoff.service';

export type RuleTarget = { fileId: string; folderId?: undefined } | { folderId: string; fileId?: undefined };

export interface NewRule {
  target: RuleTarget;
  recipients: Array<{ userId: string; publicKey: string }>;
  periodDays: number;
}

export interface ReleasedItem {
  ruleId: string;
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
  from: HandoffForMe['owner'];
  releasedAt?: string;
}

export const WITNESS_NOT_READY = 'Your witnesses are not ready. At least two must have accepted, and at least as many as your threshold.';

const MIN_WITNESSES = 2;

function masterKey(): CryptoKey {
  const key = StorageService.getMasterKey();
  if (!key) throw new Error('Your vault is locked. Unlock it to continue.');
  return key;
}

/** "a", "a and b", "a, b and c". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// --- Witnesses ---------------------------------------------------------------

async function currentShareHolders(): Promise<{ keys: Map<string, CryptoKey>; threshold: number }> {
  const set = await ApiService.getWitnesses();
  const accepted: WitnessEntry[] = set.witnesses.filter((w) => w.status === 'accepted');
  if (accepted.length < MIN_WITNESSES || accepted.length < set.threshold) throw new Error(WITNESS_NOT_READY);
  const keys = new Map<string, CryptoKey>();
  for (const w of accepted) keys.set(w.user.id, await CryptoService.importPublicKey(w.user.publicKey));
  return { keys, threshold: set.threshold };
}

export interface WitnessSummary {
  threshold: number;
  accepted: number;
  total: number;
  acceptedUserIds: string[];
}

/** The numbers the screens quote: "k of n", and how many have accepted. */
export async function witnessSummary(): Promise<WitnessSummary> {
  const set = await ApiService.getWitnesses();
  const live = set.witnesses.filter((w) => w.status === 'accepted' || w.status === 'invited');
  const accepted = live.filter((w) => w.status === 'accepted');
  return { threshold: set.threshold, accepted: accepted.length, total: live.length, acceptedUserIds: accepted.map((w) => w.user.id) };
}

// --- Files under a target -----------------------------------------------------

/** Every ready file in a folder and in all folders below it. */
async function filesUnderFolder(folderId: string): Promise<FileMetadata[]> {
  const found: FileMetadata[] = [];
  const queue = [folderId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const [files, folders] = await Promise.all([ApiService.getFiles(id), ApiService.getFolders(id)]);
    found.push(...files.filter((f) => f.status === 'READY'));
    queue.push(...folders.map((f) => f.id));
  }
  return found;
}

/** How many ready files a folder rule would cover, for the sheet head. */
export async function countFilesUnder(folderId: string): Promise<number> {
  return (await filesUnderFolder(folderId)).length;
}

async function filesUnder(target: { fileId?: string; folderId?: string }): Promise<FileMetadata[]> {
  if (target.fileId) {
    const file = await ApiService.getFile(target.fileId);
    return file.status === 'READY' ? [file] : [];
  }
  return filesUnderFolder(target.folderId!);
}

async function wrapItems(files: FileMetadata[], releaseKey: CryptoKey): Promise<HandoffItemInput[]> {
  const items: HandoffItemInput[] = [];
  for (const file of files) {
    const fileKey = await fileKeyFor(file);
    items.push({ fileId: file.id, wrappedFileKey: JSON.stringify(await Handoff.wrapFileKeyUnderRelease(fileKey, releaseKey)) });
  }
  return items;
}

async function sharesFor(releaseKey: CryptoKey, keys: Map<string, CryptoKey>, threshold: number): Promise<HandoffShareInput[]> {
  const shares = await Handoff.splitForWitnesses(releaseKey, keys, threshold);
  return [...shares].map(([witnessUserId, s]) => ({ witnessUserId, shareIndex: s.shareIndex, wrappedShare: s.wrappedShare }));
}

// --- Owner: create, list, revoke ----------------------------------------------

export async function createRule(input: NewRule): Promise<HandoffRuleDetail> {
  const owner = masterKey();
  const { keys, threshold } = await currentShareHolders();
  const files = await filesUnder(input.target);

  const releaseKey = await Handoff.createReleaseKey();
  const recipients: CreateHandoffRuleRequest['recipients'] = [];
  for (const r of input.recipients) {
    recipients.push({ userId: r.userId, wrappedReleaseKey: await Handoff.wrapForUser(releaseKey, await CryptoService.importPublicKey(r.publicKey)) });
  }

  return ApiService.createHandoffRule({
    ...(input.target.fileId ? { fileId: input.target.fileId } : { folderId: input.target.folderId }),
    periodDays: input.periodDays,
    recipients,
    items: await wrapItems(files, releaseKey),
    shares: await sharesFor(releaseKey, keys, threshold),
    wrappedReleaseKeyOwner: JSON.stringify(await Handoff.wrapForOwner(releaseKey, owner)),
  });
}

export const listRules = (): Promise<HandoffRule[]> => ApiService.listHandoffRules();
export const getRule = (id: string): Promise<HandoffRuleDetail> => ApiService.getHandoffRule(id);
export const revokeRule = (id: string): Promise<HandoffRule> => ApiService.revokeHandoffRule(id);
export const forMe = (): Promise<HandoffForMe[]> => ApiService.handoffForMe();

/** Rules that still guard something: not released and not revoked. */
export const isOpen = (rule: Pick<HandoffRule, 'state'>) => rule.state === 'active' || rule.state === 'warning';

// --- Repair --------------------------------------------------------------------

async function releaseKeyOf(detail: HandoffRuleDetail): Promise<CryptoKey> {
  return Handoff.unwrapForOwner(JSON.parse(detail.wrappedReleaseKeyOwner), masterKey());
}

async function addMissingItems(detail: HandoffRuleDetail, releaseKey: CryptoKey): Promise<void> {
  const have = new Set(detail.items.map((i) => i.fileId));
  const missing = (await filesUnder(detail)).filter((f) => !have.has(f.id));
  if (missing.length > 0) await ApiService.addHandoffItems(detail.id, await wrapItems(missing, releaseKey));
}

/**
 * Re-split stale rules against the current witnesses and wrap the files a covered folder gained.
 * Silent on success. Counts rules, not steps; the caller toasts only when `failed` is above zero.
 */
export function repairAtUnlock(): Promise<{ repaired: number; failed: number }> {
  // Unlock and the dashboard can both ask at once. Two re-splits would race, so they share one run.
  repairing ??= repairAll().finally(() => {
    repairing = null;
  });
  return repairing;
}

let repairing: Promise<{ repaired: number; failed: number }> | null = null;

/** True while a repair runs; whoever started it reports its failure, so others need not. */
export const repairRunning = () => repairing !== null;

async function repairAll(): Promise<{ repaired: number; failed: number }> {
  let repaired = 0;
  let failed = 0;
  const rules = (await listRules()).filter(isOpen).filter((r) => r.sharesStale || r.coverageGaps > 0);
  for (const rule of rules) {
    try {
      const detail = await getRule(rule.id);
      const releaseKey = await releaseKeyOf(detail);
      if (rule.sharesStale) {
        const { keys, threshold } = await currentShareHolders();
        await ApiService.replaceHandoffShares(rule.id, await sharesFor(releaseKey, keys, threshold));
      }
      if (rule.coverageGaps > 0) await addMissingItems(detail, releaseKey);
      repaired++;
    } catch {
      failed++;
    }
  }
  return { repaired, failed };
}

/**
 * Wrap one new file into every rule that covers its folder, so the gap never shows.
 * A failure leaves the gap for the repair at the next unlock.
 */
export async function coverFile(fileId: string, folderId: string | null | undefined): Promise<void> {
  if (!folderId) return;
  const folder = await ApiService.getFolder(folderId);
  if (!folder.ruleIds || folder.ruleIds.length === 0) return;
  const file = await ApiService.getFile(fileId);
  for (const ruleId of folder.ruleIds) {
    const detail = await getRule(ruleId);
    if (detail.items.some((i) => i.fileId === fileId)) continue;
    await ApiService.addHandoffItems(ruleId, await wrapItems([file], await releaseKeyOf(detail)));
  }
}

// --- Recipient -------------------------------------------------------------------

/** Items of rules that released by timer, opened with my private key. Quorum releases come with the quorum screens. */
export async function releasedItems(): Promise<ReleasedItem[]> {
  const privateKey = StorageService.getPrivateKey();
  if (!privateKey) throw new Error('Your vault is locked. Unlock it to continue.');
  const out: ReleasedItem[] = [];
  for (const rule of await forMe()) {
    if (rule.state !== 'released_timer' || !rule.wrappedReleaseKey || !rule.items) continue;
    const releaseKey = await Handoff.unwrapForUser(rule.wrappedReleaseKey, privateKey);
    for (const item of rule.items) {
      const fileKey = await Handoff.unwrapFileKeyUnderRelease(JSON.parse(item.wrappedFileKey), releaseKey);
      StorageService.cacheFileKey(item.fileId, fileKey);
      const name = await CryptoService.decryptString({ data: item.file.encryptedName, iv: item.file.encryptedNameIV }, fileKey);
      out.push({
        ruleId: rule.id,
        fileId: item.fileId,
        name,
        size: CryptoService.plaintextSize(item.file.encryptedSize),
        mimeType: item.file.mimeType,
        createdAt: item.file.createdAt,
        from: rule.owner,
        releasedAt: rule.releasedAt,
      });
    }
  }
  return out;
}

// --- Names for the screens -------------------------------------------------------

/** What each rule covers, by name. Names are decrypted here; they never come from the server. */
export async function nameRuleTargets(rules: HandoffRule[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  await Promise.all(
    rules.map(async (rule) => {
      try {
        if (rule.folderId) {
          names.set(rule.id, (await getFolder(rule.folderId)).name);
        } else if (rule.fileId) {
          const file = await ApiService.getFile(rule.fileId);
          names.set(rule.id, await CryptoService.decryptString({ data: file.encryptedName, iv: file.encryptedNameIV }, await fileKeyFor(file)));
        }
      } catch {
        names.set(rule.id, 'An item that is no longer here');
      }
    })
  );
  return names;
}

const RulesService = {
  createRule,
  listRules,
  getRule,
  revokeRule,
  forMe,
  repairAtUnlock,
  coverFile,
  releasedItems,
  witnessSummary,
  nameRuleTargets,
  joinNames,
  isOpen,
};

export default RulesService;
