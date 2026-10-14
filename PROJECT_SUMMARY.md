# Project status

Last updated: 2026-10-12

## Where it stands

CrypticStorage is a working alpha. The first cut of this repository was generated in one pass and never run: the client, the server and the tests each targeted a different API, neither half compiled, and the file encryption reused one AES-GCM nonce for every chunk. That code has been replaced.

What is true today, verified by CI:

| Check | Result |
|---|---|
| Server typecheck | clean |
| Server integration tests (real Postgres) | 43 passing |
| Client typecheck and production build | clean |
| Client crypto unit tests | 10 passing |
| End-to-end: register → upload 2 MiB+ → download → lock/unlock → share link → user share → password change | 6 passing |

## What exists

**Server** (`server/`): Express + Prisma + Postgres. Modules for auth, users, files, folders and shares; local and S3 storage drivers; zod-validated environment; rate limiting; audit log; cleanup job for abandoned uploads and expired sessions; one committed migration.

**Client** (`client/`): React + Vite. The cryptographic design is in one file, `src/services/crypto.service.ts`. Auth, file and share services sit on top. Pages: landing, register, login with 2FA step, locked-vault unlock, dashboard, file manager (folders, breadcrumbs, upload with real progress, preview, share dialog, shared-with-me), settings (password change, fingerprint, 2FA with backup codes, storage, account deletion), public share page.

**Ops**: Docker Compose (Postgres, API with files on a volume, nginx-served web app) that refuses placeholder secrets; GitHub Actions running typecheck, tests, build and the end-to-end flow; a no-Docker path using an embedded Postgres.

## Known gaps

- **No external security review.** The design follows well-known patterns (Bitwarden-style KDF split, per-file keys, fragment-carried link keys) but nobody outside this repository has audited it.
- **No password recovery.** Zero-knowledge means a lost password loses the data. A recovery-key flow is the top item on the roadmap.
- **Whole-file buffering in the browser.** Encryption happens in 1 MiB chunks, but the sealed chunks are held in memory until the single PUT completes. Multi-gigabyte files will strain browser memory; the server side already supports streaming.
- **Metadata the server can see:** file sizes (approximately), MIME types, folder structure (not names), timestamps, who shares with whom.
- **Email is the KDF salt.** This removes a round trip at login but means changing the email requires re-deriving keys, so the UI does not offer email changes.
- **Old sources still in the tree.** See the cleanup section in the README; a permission restriction prevented deleting them in the session that replaced them.

## Roadmap

1. **Recovery key.** Generate a 256-bit recovery key at signup that also wraps the master key; show it once; allow "forgot password" by re-wrapping with a new password.
2. **Streaming uploads.** Encrypt in a Web Worker and upload chunk by chunk with resumable multipart uploads (S3 multipart or tus), so a 5 GB file neither freezes the tab nor restarts from zero after a network blip.
3. **Passkeys / WebAuthn** as a second factor and, with PRF, as a way to unlock the vault without typing the password.
4. **Encrypted search.** Client-side index of file names encrypted with the master key.
5. **Thumbnails and previews** generated and encrypted client-side.
6. **Folder sharing** by wrapping a folder key, and write permissions for user shares.
7. **Browser-level end-to-end tests** with Playwright on top of the existing service-level e2e.
8. **Observability.** Prometheus metrics and structured request logs are easy to add on the pino/express base.
