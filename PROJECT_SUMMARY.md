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
- **No password recovery, by design.** A lost password loses the data. The product spec rules out recovery keys, resets and support paths; the only way anyone else ever reads an item is a handoff rule the owner set.
- **Whole-file buffering in the browser.** Encryption happens in 1 MiB chunks, but the sealed chunks are held in memory until the single PUT completes. Multi-gigabyte files will strain browser memory; the server side already supports streaming.
- **Metadata the server can see:** file sizes (approximately), MIME types, folder structure (not names), timestamps, who shares with whom.
- **Email is the KDF salt.** This removes a round trip at login but means changing the email requires re-deriving keys, so the UI does not offer email changes.

## Roadmap

The order of work is section 12 of [`docs/superpowers/specs/2026-10-14-product-core-design.md`](docs/superpowers/specs/2026-10-14-product-core-design.md). The product is a safe, not a drive: no recovery by design, handoff rules per item released by a dead-man timer or a witness quorum, irreversible acts shown one fact per screen. Anything written here before 2026-10-14 that contradicts the spec is superseded by it.
