---
title: CrypticStorage
aliases: [CrypticStorage journal, crypticstorage]
created: 2026-10-12
modified: 2026-10-13
tags: [status/active, type/project, topic/tech/code, topic/tech/devops, topic/work/crypticstorage]
status: active
type: project
project: crypticstorage
repo: "https://github.com/joemc3/CrypticStorage"
vault_synced_through: none
---

# CrypticStorage

> **What this file is.** A running project journal kept *in the repo* so that any Claude session, cloud or local, leaves a record of what it did and what comes next. It is written as an Obsidian note: copy it into the vault as-is, or let a local session merge it. The `vault_synced_through` field in the frontmatter records the date of the newest session entry that has been imported into the vault, so nothing is imported twice. The protocol is in [[#How to sync this into the vault]] and in `CLAUDE.md`.

## Current state

*(Overwritten each session. One screen, no history.)*

Working alpha of a zero-knowledge encrypted file store. Both halves build, CI is green on GitHub, and an end-to-end run drives the real client crypto against the real API.

| Area | State |
|---|---|
| Server (Express, Prisma, Postgres) | rebuilt, 43 integration tests on a real Postgres |
| Client (React, Vite) | builds, 10 crypto unit tests |
| End-to-end (register → upload → download → share) | 6 tests, runs in CI |
| Crypto | per-file keys, chunked AES-GCM with per-chunk nonces, KDF-split auth, keys in link fragments |
| Ops | Docker Compose with MinIO, GitHub Actions, no-Docker path on embedded Postgres |
| Branch | `ccr-1fec1232-1akfhk`, not yet merged, no PR opened |

## Next steps

- [ ] Delete the old generated server sources (command in README under "Repository cleanup still pending"). A sandbox permission blocked it in the cloud session.
- [ ] Open a PR from `ccr-1fec1232-1akfhk` to `master` and merge.
- [ ] Recovery key at signup, so a forgotten password is not fatal.
- [ ] Streaming chunked uploads in a Web Worker (resumable, no whole-file buffering).
- [ ] Passkeys / WebAuthn.
- [ ] Playwright browser-level e2e on top of the service-level e2e.
- [ ] External security review before anyone stores real data.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | The client's API design is the contract; the server was rewritten to match it | Client, server and tests each targeted a different API; the client's presigned-URL upload flow was the best of the three |
| 2026-10-12 | Old server sources left in tree under exclude lists instead of deleted | Sandbox refused `rm` and `git mv`; nothing lost, user deletes locally |
| 2026-10-12 | Email is the KDF salt (Bitwarden style) | No prelogin round trip; cost is that email changes need a re-wrap, so the UI does not offer them |
| 2026-10-12 | File names encrypted under the per-file key, not the master key | Lets link holders and share recipients read the name without the master key |
| 2026-10-12 | Share links carry the file key in the URL fragment | Fragment never reaches the server, so the server can gate access without being able to decrypt |
| 2026-10-12 | Redis dropped from the stack | Nothing needed it; fewer moving parts |
| 2026-10-12 | Tests run against a real embedded Postgres, not mocks | The previous mocked suite had never executed and could not catch contract drift |

## How to sync this into the vault

For a Claude session running locally with vault access (or for a human doing it by hand):

1. Target note: `Projects/CrypticStorage.md` in the vault (create it if missing; adjust the path to taste and record it here).
2. Copy the frontmatter, **Current state**, **Next steps** and **Decisions** sections over the vault note's versions. They are snapshots, not history.
3. Append every entry under **Session log** whose date is newer than `vault_synced_through` to the vault note's own session log.
4. Set `vault_synced_through` in *this* file to the newest entry date, commit it, and push.
5. If the vault has a projects MOC or a daily note for today, add a `[[CrypticStorage]]` link there.

Cloud sessions cannot reach the vault. They only append here and bump `modified`.

## Session log

*(Newest first. Each entry: what was done, what was verified, what is open. Keep entries factual; link commits.)*

### 2026-10-12 · Cloud session · from "never run" to green CI

Session: https://claude.ai/code/session_01DRpW3oXX4GMqssrs4CpRTV
Branch: `ccr-1fec1232-1akfhk` · Commits: `fa66a9f`, `f3b09de`, `341ca35`, `85afed1`

**Started with** an assessment: 23k generated lines, neither half compiled (78 + 75 type errors), zero tests had ever run, client and server spoke different APIs, and the file encryption reused one AES-GCM nonce for every chunk. Reported this, then was told to make it run and keep going.

**Did**
- Rebuilt the server against the client's API: auth with rotating refresh tokens and TOTP 2FA, files with a reserve → PUT → confirm upload flow and quota accounting, folders, anonymous share links (password, expiry, download caps), user-to-user shares, audit log, cleanup job. Storage driver abstraction: local filesystem and S3/MinIO with presigned URLs. New Prisma schema with a committed migration (the old `.gitignore` had been hiding the migrations directory).
- Fixed the client build and rewrote its crypto: PBKDF2-SHA256 at 600k iterations split into a device-only wrapping key and a server-side auth hash; random key per file; names encrypted under the file key; 1 MiB AES-GCM chunks with per-chunk nonces and chunk index and count in the AAD. Locked-vault screen with offline unlock, 2FA login step, real upload progress, share dialog and a working public share page.
- Wrote tests at three levels: server integration (Jest + supertest, embedded Postgres locally, service container in CI), client crypto units (vitest), and an end-to-end script that boots the real API and drives the real client services from Node.
- Docker Compose rebuilt (refuses placeholder secrets), GitHub Actions with three jobs, README / PROJECT_SUMMARY / SECURITY rewritten honestly.

**Verified**: server 43/43, client 10/10, e2e 6/6, GitHub Actions run 1 green on all three jobs.

**Open**
- Old server sources still in tree (sandbox blocked deletion); README has the removal command.
- No PR opened; branch is pushed and green.
- Roadmap items above, recovery key first.

**Worth remembering**: the first `npm install` in the cloud produced two lockfiles that had never been committed; `prisma/migrations` was gitignored; `jest` must run with one worker because every suite shares a database.
