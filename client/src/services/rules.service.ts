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
  toApiError,
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
import { lookupContact } from './witness.service';

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

export interface ReleasedItems {
  items: ReleasedItem[];
  /** Released rules whose key or items could not be opened here. Their items are left out; the rest still show. */
  failedRuleIds: string[];
}

/** A witness's key differs from the one this account trusted. Nothing is wrapped for it until it is re-trusted. */
export class WitnessKeyChangedError extends Error {
  constructor(public readonly email: string) {
    super(
      `The key for your witness ${email} has changed since you last trusted it. Nothing was saved. Compare the fingerprint with them in person and mark it verified, then try again.`
    );
    this.name = 'WitnessKeyChangedError';
  }
}

/** The server's code when the threshold moved between reading the witness set and sending the split. */
const THRESHOLD_CHANGED = 'THRESHOLD_CHANGED';

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

/**
 * The accepted witnesses' keys, each checked against this account's trust rows the way the share dialog checks a
 * recipient (trust on first use): the first sight is recorded, a match passes, a changed key throws before anything
 * is wrapped for it.
 */
async function currentShareHolders(): Promise<{ keys: Map<string, CryptoKey>; threshold: number }> {
  const set = await ApiService.getWitnesses();
  const accepted: WitnessEntry[] = set.witnesses.filter((w) => w.status === 'accepted');
  if (accepted.length < MIN_WITNESSES || accepted.length < set.threshold) throw new Error(WITNESS_NOT_READY);
  const keys = new Map<string, CryptoKey>();
  for (const w of accepted) {
    const contact = await lookupContact(w.user.email);
    if (contact.keyChanged) throw new WitnessKeyChangedError(w.user.email);
    // The two server answers must name the same person and key, or the trust check did not cover the key in use.
    if (contact.id !== w.user.id || contact.publicKey !== w.user.publicKey) throw new WitnessKeyChangedError(w.user.email);
    keys.set(w.user.id, await CryptoService.importPublicKey(contact.publicKey));
  }
  return { keys, threshold: set.threshold };
}

const isThresholdChanged = (error: unknown) => toApiError(error).code === THRESHOLD_CHANGED;

/**
 * Split for the current witnesses and send the result with the k it was split with. When the server says the
 * threshold moved in between, read the set again and try once more; a second refusal goes to the caller.
 */
async function sendWithCurrentSplit<T>(
  releaseKey: CryptoKey,
  send: (shares: HandoffShareInput[], threshold: number) => Promise<T>,
  first?: { keys: Map<string, CryptoKey>; threshold: number }
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { keys, threshold } = attempt === 0 && first ? first : await currentShareHolders();
    try {
      return await send(await sharesFor(releaseKey, keys, threshold), threshold);
    } catch (error) {
      if (attempt > 0 || !isThresholdChanged(error)) throw error;
    }
  }
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
  // Checked first, so a set that is not ready or a changed key stops before any file is touched.
  const holders = await currentShareHolders();
  const files = await filesUnder(input.target);

  const releaseKey = await Handoff.createReleaseKey();
  const recipients: CreateHandoffRuleRequest['recipients'] = [];
  for (const r of input.recipients) {
    recipients.push({ userId: r.userId, wrappedReleaseKey: await Handoff.wrapForUser(releaseKey, await CryptoService.importPublicKey(r.publicKey)) });
  }

  const items = await wrapItems(files, releaseKey);
  const wrappedReleaseKeyOwner = JSON.stringify(await Handoff.wrapForOwner(releaseKey, owner));
  return sendWithCurrentSplit(releaseKey, (shares, threshold) =>
    ApiService.createHandoffRule({
      ...(input.target.fileId ? { fileId: input.target.fileId } : { folderId: input.target.folderId }),
      periodDays: input.periodDays,
      recipients,
      items,
      shares,
      threshold,
      wrappedReleaseKeyOwner,
    }),
    holders
  );
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
        await sendWithCurrentSplit(releaseKey, (shares, threshold) => ApiService.replaceHandoffShares(rule.id, shares, threshold));
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

/**
 * Items of rules that released, opened with my private key: by timer from my wrapped release key, by quorum from the
 * voting witnesses' shares. A rule that cannot be opened is skipped and named in `failedRuleIds`; the others still show.
 */
export async function releasedItems(): Promise<ReleasedItems> {
  const privateKey = StorageService.getPrivateKey();
  if (!privateKey) throw new Error('Your vault is locked. Unlock it to continue.');
  const items: ReleasedItem[] = [];
  const failedRuleIds: string[] = [];
  for (const rule of await forMe()) {
    if (!rule.items) continue;
    try {
      let releaseKey: CryptoKey;
      if (rule.state === 'released_timer' && rule.wrappedReleaseKey) {
        releaseKey = await Handoff.unwrapForUser(rule.wrappedReleaseKey, privateKey);
      } else if (rule.state === 'released_quorum' && rule.voteShares?.length) {
        releaseKey = await Handoff.combineAndUnwrap(rule.voteShares.map((s) => s.wrappedShare), privateKey);
      } else {
        continue;
      }
      const opened: ReleasedItem[] = [];
      const keys: Array<[string, CryptoKey]> = [];
      for (const item of rule.items) {
        const fileKey = await Handoff.unwrapFileKeyUnderRelease(JSON.parse(item.wrappedFileKey), releaseKey);
        keys.push([item.fileId, fileKey]);
        const name = await CryptoService.decryptString({ data: item.file.encryptedName, iv: item.file.encryptedNameIV }, fileKey);
        opened.push({
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
      for (const [fileId, key] of keys) StorageService.cacheFileKey(fileId, key);
      items.push(...opened);
    } catch {
      failedRuleIds.push(rule.id);
    }
  }
  return { items, failedRuleIds };
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
