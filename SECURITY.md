# Security design

This describes what CrypticStorage protects, what it does not, and how the pieces fit. It is a design note, not an audit.

## Goal

A server operator, a database leak or a storage-bucket leak must not reveal file contents, file names or folder names. The server must still be able to authenticate users, enforce quotas, and gate share links with passwords, expiry and download limits.

## Keys

| Key | Created | Stored where | Protected by |
|---|---|---|---|
| Password-derived bits (512) | login/register, in the browser | never stored | PBKDF2-SHA256, 600,000 iterations, salt = SHA-256(email) |
| Wrapping key | first 256 derived bits | memory only, non-extractable | the password |
| Auth hash | SHA-256 of the last 256 derived bits | server, bcrypt-hashed | the password; useless for decryption |
| Master key | random AES-256 at signup | server + localStorage, wrapped (AES-GCM) with the wrapping key | the password |
| RSA-OAEP 4096 key pair | signup | public key in clear on the server; private key encrypted with the master key | the master key |
| File key | random AES-256 per file | wrapped with the master key; for shares, wrapped with the recipient's public key or placed in the link fragment | master key / recipient private key / link |
| TOTP secret | 2FA setup | server, AES-256-GCM under a server key | server configuration |

The server never receives the password, the wrapping key, the master key, the private key or any file key in clear.

**Lock.** Raw keys (wrapping, master, private and cached file keys) live only in a module-level variable. Wrapped blobs may stay in `localStorage` so unlock works offline. The client locks after the chosen idle period, on `pagehide`, and on demand.

No format version changes here: the content format, KDF and key hierarchy are untouched.

## Data at rest on the server

- File content: ciphertext only. Format v1: plaintext split into 1 MiB chunks; chunk *i* of *n* sealed with AES-256-GCM using nonce `base[0..8] || u32(i)` and additional data `u32(i) || u32(n)`. Decryption rejects any chunk that was reordered, dropped, duplicated or modified.
- File names: encrypted with the file key, so anyone who legitimately holds the file key (owner, link holder, share recipient) can read the name and nobody else can.
- Folder names: encrypted with the master key.
- What the server can see: ciphertext sizes, MIME types, the folder tree shape, timestamps, share relationships, IP addresses and user agents in the audit log.

## Authentication

- Login sends `{ email, authHash }`. The server compares against a bcrypt hash and runs bcrypt for unknown emails too, so timing does not reveal account existence.
- Access tokens are 15-minute JWTs bound to a session row; refresh tokens are random, stored hashed, rotated on every use, and invalidated by logout, password change (all other sessions) and expiry.
- With 2FA enabled, password login returns a 5-minute challenge token that can do nothing except complete the second factor. The vault blobs are withheld until the factor is verified. Backup codes are single-use and stored hashed.
- Credential-bearing endpoints are rate limited per IP.
- Register creates the account with `contract_acknowledged_at` set and issues no session. Email verification is mandatory: the token is 32 random bytes, stored as SHA-256 only, single use, valid 24 hours, and requested behind the auth rate limiter.
- Login returns 401 for a wrong credential before any verification state is revealed, and 403 for an unverified account only when the credential is valid. Unverified accounts are deleted after 7 days.
- `last_activity_at` is new server-visible metadata, touched at most every 5 minutes.

## Sharing

- **Links:** `https://app/s/<token>#<file key, base64url>`. The fragment never leaves the browser. The server enforces password (bcrypt), expiry, revocation and download caps, and increments the counter only when bytes are actually served. A link therefore protects against the server but not against anyone who obtains the full URL.
- **User to user:** the owner fetches the recipient's public key, wraps the file key with RSA-OAEP, and the server stores the wrapped key. Either party can revoke. Public keys are not yet verified out of band, so a malicious server could substitute a public key (a classic key-server attack); the fingerprint in Settings is the SHA-256 of the account's RSA public key in SPKI form, shown grouped by four, and the share dialog shows the same for a recipient, so two people can compare them. Trust is not stored yet; that is the handoff stage.

## Transport and content endpoints

- Content uploads and downloads use short-lived, single-purpose tokens in the URL (scope `upload` or `download`, bound to one file id) because browsers send raw bytes to these URLs without headers. With an S3 driver and a public endpoint, presigned URLs replace them.
- Uploads are reserved first (quota and size checked), bytes are streamed with a hard cap at the declared size, and the file only becomes visible after a confirm step verifies the stored size.
- Fonts are self-hosted; the client contacts no third party.
- Deploy behind HTTPS. The Web Crypto API is only available in secure contexts, and the client refuses to start without one.

## Out of scope today

- Compromise of the user's device or browser.
- A malicious client build. Users must trust the served JavaScript; subresource integrity or a packaged client would reduce this.
- Traffic analysis of sizes and timing.
- Password recovery: there is none by design until the recovery-key feature lands.

## Reporting

Open a private security advisory on the repository rather than a public issue.
