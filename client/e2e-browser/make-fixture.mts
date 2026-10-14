/**
 * Builds fixtures/vault.json: a small, real vault for the browser smoke.
 *
 * Run from client/ under Node 22.18+ (type stripping on):
 *   node e2e-browser/make-fixture.mts
 *
 * It uses the real crypto service, so the smoke unlocks a vault the app really opens and shows
 * names it really decrypts. The JSON holds only what a server would hold. The password and the
 * public link's key come from fixture-constants.ts; the JSON carries a hash of the password so
 * the spec can tell when the two have drifted apart. Do not reuse the constants anywhere.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import CryptoService from '../src/services/crypto.service.ts';
import { FIXTURE_EMAIL, FIXTURE_LINK_KEY_SEED, FIXTURE_PASSWORD } from './fixture-constants.ts';

const PASSWORD = FIXTURE_PASSWORD;
const EMAIL = FIXTURE_EMAIL;
const here = dirname(fileURLToPath(import.meta.url));

const salt = await CryptoService.saltForEmail(EMAIL);
const derived = await CryptoService.deriveKeys(PASSWORD, salt);
const masterKey = await CryptoService.generateMasterKey();
const rsa = await CryptoService.generateRSAKeyPair();
const publicKey = await CryptoService.exportPublicKey(rsa.publicKey);
const wrappedMasterKey = JSON.stringify(await CryptoService.wrapKey(masterKey, derived.wrappingKey));
const encryptedPrivateKey = JSON.stringify(
  await CryptoService.encryptBytes(await CryptoService.exportPrivateKey(rsa.privateKey), masterKey)
);

const user = {
  id: 'u-fixture',
  email: EMAIL,
  publicKey,
  storageUsed: 40_000_000,
  storageLimit: 1_073_741_824,
  twoFactorEnabled: true,
  displayName: 'Mara Hale',
  lockAfterMinutes: 5,
  emailVerifiedAt: '2026-09-02T09:00:00.000Z',
  createdAt: '2026-09-02T09:00:00.000Z',
  updatedAt: '2026-10-12T09:00:00.000Z',
};
const vault = { wrappedMasterKey, encryptedPrivateKey, publicKey, salt, kdfIterations: derived.iterations };

async function folder(id: string, name: string, createdAt: string) {
  const enc = await CryptoService.encryptString(name, masterKey);
  return { id, userId: user.id, encryptedName: enc.data, encryptedNameIV: enc.iv, createdAt, updatedAt: createdAt };
}

/** A file whose name is encrypted under its own key, which is wrapped under the master key (or for a recipient). */
async function file(opts: { id: string; name: string; size: number; mimeType: string; folderId?: string; createdAt: string; wrapFor?: CryptoKey }) {
  const fileKey = await CryptoService.generateAesKey();
  const name = await CryptoService.encryptString(opts.name, fileKey);
  let encryptedFileKey: string;
  let fileKeyIV = '';
  if (opts.wrapFor) {
    encryptedFileKey = await CryptoService.wrapKeyForRecipient(fileKey, opts.wrapFor);
  } else {
    const wrapped = await CryptoService.wrapKey(fileKey, masterKey);
    encryptedFileKey = wrapped.data;
    fileKeyIV = wrapped.iv;
  }
  return {
    id: opts.id,
    userId: user.id,
    ...(opts.folderId ? { folderId: opts.folderId } : {}),
    encryptedName: name.data,
    encryptedNameIV: name.iv,
    encryptedFileKey,
    fileKeyIV,
    iv: 'AAAAAAAAAAAAAAAA',
    encryptedSize: CryptoService.encryptedSizeFor(opts.size),
    mimeType: opts.mimeType,
    status: 'READY',
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
  };
}

const folders = [
  await folder('folder-estate', 'Estate', '2026-09-10T10:00:00.000Z'),
  await folder('folder-receipts', 'Receipts', '2026-09-12T10:00:00.000Z'),
];
const rootFiles = [
  await file({ id: 'file-deed', name: 'House deed scan.jpg', size: 2_400_000, mimeType: 'image/jpeg', createdAt: '2026-10-01T10:00:00.000Z' }),
  await file({ id: 'file-seed', name: 'Seed phrase, cold wallet.txt', size: 412, mimeType: 'text/plain', createdAt: '2026-09-28T10:00:00.000Z' }),
];
const estateFiles = [
  await file({ id: 'file-tax', name: 'Property tax 2025.pdf', size: 184_000, mimeType: 'application/pdf', folderId: 'folder-estate', createdAt: '2026-10-05T10:00:00.000Z' }),
];
const sharedWithMe = [
  {
    ...(await file({ id: 'file-shared', name: 'Mum’s recipe cards.pdf', size: 920_000, mimeType: 'application/pdf', createdAt: '2026-10-08T10:00:00.000Z', wrapFor: rsa.publicKey })),
    shareId: 'share-1',
    permissions: 'read',
    sharedBy: { id: 'u-sam', email: 'sam.hale@proton.me' },
  },
];

// A public link: its key (in the URL fragment, never on the server) is derived from a constant.
const linkKey = await CryptoService.importAesKey(createHash('sha256').update(FIXTURE_LINK_KEY_SEED).digest());
const linkName = await CryptoService.encryptString('Letter of wishes.pdf', linkKey);
const publicShare = {
  info: {
    token: 'some-token',
    fileId: 'file-linked',
    encryptedName: linkName.data,
    encryptedNameIV: linkName.iv,
    encryptedSize: CryptoService.encryptedSizeFor(310_000),
    mimeType: 'application/pdf',
    iv: 'AAAAAAAAAAAAAAAA',
    passwordProtected: false,
    downloadsRemaining: 3,
    sharedBy: 'm.hale@fastmail.com',
  },
};

const out = {
  _comment: 'Test fixture: only what a server would hold. Regenerate with: node e2e-browser/make-fixture.mts',
  passwordSha256: createHash('sha256').update(PASSWORD).digest('hex'),
  tokens: { accessToken: 'fixture-access', refreshToken: 'fixture-refresh', expiresAt: 4_102_444_800_000 },
  user,
  vault,
  stats: { used: user.storageUsed, limit: user.storageLimit, fileCount: 3, folderCount: 2 },
  folders,
  files: { root: rootFiles, 'folder-estate': estateFiles },
  sharedWithMe,
  publicShare,
};

writeFileSync(join(here, 'fixtures', 'vault.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote fixtures/vault.json');
