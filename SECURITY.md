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
- **User to user:** the owner fetches the recipient's public key, wraps the file key with RSA-OAEP, and the server stores the wrapped key. Either party can revoke. Public keys are not yet verified out of band, so a malicious server could substitute a public key (a classic key-server attack); the fingerprint in Settings is the SHA-256 of the account's RSA public key in SPKI form, and the share dialog shows the same for a recipient, so two people can compare them. The displayed value is the first 128 bits: 32 hex characters grouped by four, not the full digest. Trust is stored since the handoff stage, see below.

## Handoff

A handoff rule names a file or a folder (with its whole subtree), one or more recipients and a period. When the rule releases, the recipients can read what it covers. The owner chose this ahead of time; nobody asks the owner again.

**Release key.** Each rule has its own random AES-256 release key, made in the owner's browser. The server never receives it in the clear. It exists in four wrapped forms:

- the owner's copy, wrapped with the owner's master key, so the owner can repair the rule later;
- one copy per recipient, wrapped with RSA-OAEP under that recipient's public key, released by the server only after a timer release;
- each covered file's key, wrapped with AES-GCM under the release key, one blob per file;
- Shamir shares of the release key, one per witness, each wrapped with RSA-OAEP under that witness's public key.

Shamir splitting is in-house, over GF(2^8) with the AES polynomial. A set has n witnesses with k of n, where n is 2 to 7 and k is at least 2 and at most n. A witness can unwrap a share but one share reveals nothing about the release key.

**What the server stores.** Opaque blobs only. It stores no release key, no share in the clear and no file key in the clear. Before a release it keeps every blob and hands none of them to a recipient. It still sees the shape: which accounts are witnesses, which are recipients, which files a rule covers, when each rule was made and when the owner was last active.

**Timer.** The server clock decides. The owner's activity (a sign-in, or any authenticated request, checked at most every five minutes) restarts the period. At 75, 90 and 95 percent of the period the owner is emailed, and at 100 percent the rule releases and the recipients' wrapped release key is served. Reminder mails carry a check-in link. Its token is 32 random bytes, stored as SHA-256 only, single use, and resets the clock when followed. Mail never names a file or folder, because the server cannot read names. The period is 30 days by default.

**Quorum.** Any accepted witness can open a release request. The request fixes k at the moment it opens. Each witness who votes unwraps their own share in the browser and re-wraps it under the public key of every recipient of every covered rule, then sends those blobs. When k votes are in, the rule releases and the recipients receive the re-wrapped shares, combine k of them and unwrap the release key themselves. The server never combines shares. A request is cancelled when the owner signs in and by any owner-initiated handoff write: a new rule, a revoke, new shares, a witness invited or removed, a changed threshold. The witnesses are told. Vote shares are tied to one split of the key through `released_by_request_id`: replacing or staling a rule's shares deletes its vote shares in open requests, so a release can never combine shares from two different splits. When the witness set changes, the rule's shares are flagged stale and the owner's client re-splits the release key at the next unlock.

**Trust on first use.** Before wrapping anything for a person, the client looks up their public key and computes the fingerprint locally. The server stores its own 64-hex SHA-256 of the SPKI bytes; the client displays and compares the first 32 hex, a 128-bit prefix. The first key seen for a contact is recorded. If a later lookup returns a different key, nothing is wrapped for it and the person is warned. Sharing and inviting stay blocked until the owner marks the new key verified in person. Public-key lookup answers 404 for an unverified account, the same as for no account.

**What a released rule means.** Release cannot be undone. The server keeps the record of the rule, who it covered and when it released. The owner's own files and keys are unchanged. Revoking a rule before it releases deletes its blobs, including the owner's wrapped release key.

This is a design for a trusted dead man's switch, not a guarantee. A witness quorum that colludes with a malicious server, or recipients whose keys were substituted before the first sighting, can still release what the owner meant to keep.

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
- A fingerprint that two people never compare. Trust on first use catches a changed key, not a key that was wrong from the start.
- A witness quorum that colludes. Any k witnesses together can release what the rule covers.

## Reporting

Open a private security advisory on the repository rather than a public issue.
