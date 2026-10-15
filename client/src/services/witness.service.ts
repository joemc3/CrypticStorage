/**
 * CrypticStorage - Witness Service
 *
 * Thin wrappers over the witness endpoints, and the trust-on-first-use lookup that the witness
 * page and the share dialog both use before they put a person's public key to work.
 */

import CryptoService from './crypto.service';
import ApiService, { toApiError, type PublicKeyLookup, type WitnessEntry, type WitnessInvitation, type WitnessInvitations, type WitnessSet } from './api.service';

export const NO_ACCOUNT_MESSAGE = 'No account with that email, or it is not verified yet.';

export interface ContactLookup extends PublicKeyLookup {
  /** The key differs from the one this browser's account last saw for the contact. Nothing was recorded. */
  keyChanged: boolean;
  verifiedInPerson: boolean;
  /** Fingerprint computed here from the key, in groups of four. This is what the person is shown. */
  localFingerprint: string;
}

const hex = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * Fetch a contact's public key and decide how far to trust it.
 * The fingerprint is recomputed locally and must agree with the server's. Then:
 * first use records the key; a match refreshes it; a different key is reported and left alone,
 * so the caller can show the red callout and the person can re-trust it deliberately.
 */
export async function lookupContact(email: string): Promise<ContactLookup> {
  let result: PublicKeyLookup;
  try {
    result = await ApiService.getPublicKey(email.trim().toLowerCase());
  } catch (error) {
    const api = toApiError(error);
    throw new Error(api.statusCode === 404 || api.code === 'NO_ACCOUNT' ? NO_ACCOUNT_MESSAGE : api.message);
  }
  const localFingerprint = await CryptoService.publicKeyFingerprint(result.publicKey);
  // The local value is the first 128 bits; the server sends the whole SHA-256.
  if (!hex(result.fingerprint).startsWith(hex(localFingerprint))) {
    throw new Error('The key the server sent does not match its own fingerprint. Do not use it.');
  }

  const { trust } = result;
  if (trust && hex(trust.fingerprint) !== hex(result.fingerprint)) {
    return { ...result, localFingerprint, keyChanged: true, verifiedInPerson: false };
  }
  await ApiService.markContactSeen(result.id);
  return { ...result, localFingerprint, keyChanged: false, verifiedInPerson: trust?.verifiedInPerson ?? false };
}

export function setContactVerified(userId: string, verifiedInPerson: boolean) {
  return ApiService.setContactTrust(userId, verifiedInPerson);
}

export function listWitnesses(): Promise<WitnessSet> {
  return ApiService.getWitnesses();
}
export function invite(email: string): Promise<WitnessEntry> {
  return ApiService.inviteWitness(email.trim().toLowerCase());
}
/** Send an invited witness their invitation email again. */
export function resend(id: string): Promise<WitnessEntry> {
  return ApiService.resendWitnessInvitation(id);
}
export async function remove(id: string): Promise<void> {
  await ApiService.removeWitness(id);
}
export function setThreshold(k: number): Promise<WitnessSet> {
  return ApiService.setWitnessThreshold(k);
}
export function invitations(): Promise<WitnessInvitations> {
  return ApiService.getWitnessInvitations();
}
export function accept(id: string): Promise<WitnessInvitation> {
  return ApiService.acceptWitnessInvitation(id);
}
export function decline(id: string): Promise<WitnessInvitation> {
  return ApiService.declineWitnessInvitation(id);
}
