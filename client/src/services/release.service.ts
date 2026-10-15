/**
 * CrypticStorage - Release Service (quorum, witness side)
 *
 * A witness opens a release request and adds a vote. A vote re-wraps the witness's own
 * share of each rule's release key for every recipient of that rule, then sends all of
 * them in one request. A share never leaves this module in the clear: it is unwrapped
 * and re-wrapped inside Web Crypto and only the recipient-wrapped blob is sent.
 */

import CryptoService from './crypto.service';
import ApiService, { type OwnerReleaseRequest, type ReleasePerson, type ReleaseRequest, type ReleaseVoteResult, type ReleaseVoteShareInput } from './api.service';
import StorageService from './storage.service';
import { rewrapShareForRecipient } from './handoff.service';

export interface WitnessCard {
  /** The request id is not a card id: one owner, one card. */
  owner: ReleasePerson;
  /** The open request, if any. At most one is open per owner. */
  open: ReleaseRequest | null;
  /** Completed and cancelled requests, newest first. */
  closed: ReleaseRequest[];
}

export const listRequests = (): Promise<ReleaseRequest[]> => ApiService.listReleaseRequests();
/** The owner's own release requests, newest first: the C7 notice is built from these. */
export const myRequests = (): Promise<OwnerReleaseRequest[]> => ApiService.listMyReleaseRequests();
export const openRequest = (ownerId: string): Promise<ReleaseRequest> => ApiService.openReleaseRequest(ownerId);

/** True when no rule in the request can take a vote now: each waits for its owner to repair the shares. */
export const awaitingRepair = (request: Pick<ReleaseRequest, 'rules'>): boolean => request.rules.every((r) => r.sharesStale);

/** Add my vote: one re-wrapped share per fresh rule and recipient, in one request. Stale rules stay out of it. */
export async function vote(request: ReleaseRequest): Promise<ReleaseVoteResult> {
  const privateKey = StorageService.getPrivateKey();
  if (!privateKey) throw new Error('Your vault is locked. Unlock it to continue.');

  const rules = new Map(request.rules.filter((r) => !r.sharesStale).map((r) => [r.ruleId, r]));
  const imported = new Map<string, CryptoKey>();
  const shares: ReleaseVoteShareInput[] = [];
  for (const mine of request.myShares) {
    const rule = rules.get(mine.ruleId);
    if (!rule) continue;
    for (const recipient of rule.recipients) {
      let key = imported.get(recipient.userId);
      if (!key) {
        key = await CryptoService.importPublicKey(recipient.publicKey);
        imported.set(recipient.userId, key);
      }
      shares.push({ ruleId: mine.ruleId, recipientUserId: recipient.userId, wrappedShare: await rewrapShareForRecipient(mine.wrappedShare, privateKey, key) });
    }
  }
  return ApiService.voteOnReleaseRequest(request.id, shares);
}

const byClosedDesc = (a: ReleaseRequest, b: ReleaseRequest) => new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime();

/** One card per owner I serve, with their open request and the ones that ended. */
export async function witnessCards(): Promise<WitnessCard[]> {
  const [{ serving }, requests] = await Promise.all([ApiService.getWitnessInvitations(), listRequests().catch(() => [] as ReleaseRequest[])]);
  const seen = new Set<string>();
  const cards: WitnessCard[] = [];
  for (const s of serving) {
    if (seen.has(s.owner.id)) continue;
    seen.add(s.owner.id);
    const theirs = requests.filter((r) => r.owner.id === s.owner.id);
    cards.push({
      owner: s.owner,
      open: theirs.find((r) => r.state === 'open') ?? null,
      closed: theirs.filter((r) => r.state !== 'open').sort(byClosedDesc),
    });
  }
  return cards;
}

const ReleaseService = { listRequests, openRequest, vote, witnessCards, awaitingRepair };

export default ReleaseService;
