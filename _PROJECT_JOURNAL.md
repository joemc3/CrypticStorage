---
project: CrypticStorage
repo: https://github.com/joemc3/CrypticStorage
journal_format: 1
updated: 2026-10-14
last_session: 2026-10-14
---

# CrypticStorage · project journal

This file is the record of every working session on this repository, kept here because a cloud session cannot write anywhere else. It is meant to be read by the owner's own agents and notebooks, which apply their own rules to it. It prescribes nothing about where or how it is ingested.

Structure is fixed so it can be parsed: the frontmatter above, then the four sections below in this order. **Current state**, **Next steps** and **Decisions** are snapshots that each session overwrites. **Session log** is append-only, newest first, one `###` heading per session in the form `YYYY-MM-DD · <where it ran> · <one-line summary>`.

## Current state

Working alpha of a zero-knowledge encrypted file store. Both halves build, CI is green on GitHub, and an end-to-end run drives the real client crypto against the real API.

| Area | State |
|---|---|
| Server (Express, Prisma, Postgres) | rebuilt, 43 integration tests on a real Postgres; dead generated sources deleted 2026-10-14 |
| Client (React, Vite) | builds, 10 crypto unit tests |
| End-to-end (register → upload → download → share) | 6 tests, runs in CI |
| Crypto | per-file keys, chunked AES-GCM with per-chunk nonces, KDF-split auth, keys in link fragments |
| Ops | Docker Compose (Postgres + API on a volume + nginx web), GitHub Actions with four jobs including a Docker build and smoke, no-Docker path on embedded Postgres |
| Branch | `main` (renamed from `master` 2026-10-14, protected, PR-only). No other branches on origin |

## Next steps

- [x] Delete the old generated server sources. (2026-10-14, stage 1)
- [x] Open a PR from `ccr-1fec1232-1akfhk` to `master` and merge. (PR #2, merged 2026-10-13)
- [x] Stale branch `claude/audit-and-redesign-ui-...` reviewed and deleted (2026-10-14).
- [x] Rename `master` to `main`, protect it, adopt the branch-and-PR convention (this session).
- [x] Product core spec reviewed and merged (PR #4); stage 1 plan merged (PR #5).
- [x] Add a Docker build and smoke job to CI. (2026-10-14, stage 1)
- [ ] Owner runs the Claude Design session against `docs/design/brief/` and places the output under `docs/design/output/`; then reconcile here into `docs/design/decisions.md` (spec section 11).
- [ ] Stage 2: signup as a contract, mandatory email verification, auto-lock; email service enters the stack. Write spec and plan together in one PR.
- [ ] Recovery key at signup, so a forgotten password is not fatal.
- [ ] Streaming chunked uploads in a Web Worker (resumable, no whole-file buffering).
- [ ] Passkeys / WebAuthn.
- [ ] Playwright browser-level e2e on top of the service-level e2e.
- [ ] External security review before anyone stores real data.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-10-12 | The client's API design is the contract; the server was rewritten to match it | Client, server and tests each targeted a different API; the client's presigned-URL upload flow was the best of the three |
| 2026-10-12 | Old server sources left in tree under exclude lists instead of deleted | Sandbox refused `rm` and `git mv`; nothing lost, owner deletes locally |
| 2026-10-12 | Email is the KDF salt (Bitwarden style) | No prelogin round trip; cost is that email changes need a re-wrap, so the UI does not offer them |
| 2026-10-12 | File names encrypted under the per-file key, not the master key | Lets link holders and share recipients read the name without the master key |
| 2026-10-12 | Share links carry the file key in the URL fragment | Fragment never reaches the server, so the server can gate access without being able to decrypt |
| 2026-10-12 | Redis dropped from the stack | Nothing needed it; fewer moving parts |
| 2026-10-12 | Tests run against a real embedded Postgres, not mocks | The previous mocked suite had never executed and could not catch contract drift |
| 2026-10-14 | `main` replaces `master`; all work on `<type>/<topic>` branches merged by PR with a merge commit; `main` requires the three CI jobs | Same convention as the owner's other repositories, so sessions and tooling behave the same everywhere |
| 2026-10-14 | MinIO dropped from the Docker stack; the API's local driver on a named volume is the default | MinIO deleted its Docker Hub and Quay images in September 2026 and the last free release carries an auth-bypass CVE. The stack streamed through the API anyway, so MinIO added a service and two secrets for nothing. The S3 driver stays for external stores (S3, R2, Garage) via `STORAGE_DRIVER=s3` in `.env` |

## Session log

### 2026-10-14 · local (Claude Code) · stage 1: dead sources deleted, Docker smoke in CI, design brief written

Session: Claude Code, local checkout · Branch: `chore/stage-1-cleanup-and-brief` · Commits: `593d839`, `3aa6326`, `c08b8d5`, `9a6f3a9`

**Did** (one PR for all of stage 1, per the owner's PR-sizing rule recorded in `CLAUDE.md`)
- Deleted the generated server sources that the 2026-10-12 rebuild replaced: 40 files under `server/src/{controllers,routes,services,utils}`, `server/src/config/{database,redis,storage}.ts`, five `*.middleware.ts` plus `middleware/index.ts`, `server/tests/{unit,integration,setup.ts,README.md}`, `server/TESTS_SUMMARY.md`. Trimmed the exclude lists in both tsconfigs and `.dockerignore`. Removed the cleanup notes from README, CLAUDE.md and PROJECT_SUMMARY; the summary's roadmap now points at the spec instead of listing a recovery key.
- CI job `Docker (build + smoke)`: throwaway secrets, `docker compose up --build --wait`, health read through nginx, logs only on failure, teardown always. To be added to branch protection after its first green run.
- Found and fixed a real setup bug on the way: a base64 `POSTGRES_PASSWORD` can contain `/`, `+` or `=`, which breaks the `postgresql://` URL compose builds (Prisma P1013). README, `.env.example` and CI now generate it with `openssl rand -hex 24`.
- Design brief under `docs/design/brief/` (README plus five numbered files: product core, principles, screens and flows with 14 verbatim sentences, constraints, current UI inventory), an empty `docs/design/output/`, and `docs/design/decisions.md` for the reconciliation.
- `CLAUDE.md`: four CI jobs; PR sizing rule; process skills are optional.

**Verified**: server typecheck clean and 43/43 after the deletion; client typecheck clean and 10/10; `git grep` finds no reference to a deleted path outside the journal and history; local rehearsal of the exact CI smoke sequence passes (`status ok`, `storage local`) and tears down to zero containers; workflow YAML parses with four jobs.

**Open**: owner runs Claude Design against the brief; stage 2 spec and plan next, in one PR.

**Worth remembering**: `docker compose up --wait` returns non-zero when a dependency is unhealthy, which is what makes the smoke job honest. The `plan/` and `spec/` branches of this session were too fine-grained; from here, one PR per sitting.

### 2026-10-14 · local (Claude Code) · env setup documented; Docker stack made to actually start; `main` replaces `master` with the PR convention

Session: Claude Code, local checkout · Branch: `master`, then `main` · Commits: `10497bb`, `aec80d1`, `4e48b23`, plus the branch `chore/main-branch-and-workflow`

**Started with** the owner having copied `.env.example` to `.env` and asking what to put in it, then running `docker compose up` and hitting `pull access denied for minio/minio`.

**Did**
- README "Run it": each path is split into **First time only** (copy the example env file and fill it with a one-shot `perl -pi` + `openssl rand` command) and **Every time** (`make up` / the three `make dev-*` terminals). The first draft mixed the two and read as if the env file had to be recreated on every start; the owner caught that. Same explanation in the headers of both example env files.
- Docker stack: removed the MinIO service. MinIO deleted its Docker Hub repositories around 2026-09-11 and the Quay mirror followed, so no tag pulls anywhere. The API now runs the local driver with `/app/data` on a `storage_data` volume; `.env` needs only `JWT_SECRET` and `POSTGRES_PASSWORD`. The S3 driver is still wired through `STORAGE_DRIVER=s3` + `S3_*` in `.env` for an external store.
- Server image: `apk add openssl` in both Dockerfile stages. Without it Prisma 5.22 cannot detect the OpenSSL version at `prisma generate`, falls back to OpenSSL 1.1 engines, and `prisma migrate deploy` dies on Alpine 3.24 (only `libssl.so.3`) with "Could not parse schema engine response".
- `server/src/config/env.ts`: empty-string env values are now treated as unset before zod parses. Compose templates like `S3_PUBLIC_ENDPOINT: ${S3_PUBLIC_ENDPOINT:-}` pass `""`, which `z.string().url().optional()` rejected, so the API crash-looped with "S3_PUBLIC_ENDPOINT: Invalid url". This would have hit the old MinIO stack too.
- Embedded Postgres (`server/scripts/embedded-db.mjs`, `server/tests/helpers/globalSetup.ts`): `createPostgresUser` is now `process.getuid?.() === 0`. It was hard-coded `true`, which only works as root (the cloud sandbox); on a normal macOS account `initdb` fails with "Failed to create and initialize a new user on this system", so neither `make dev-db` nor `make test` had ever worked locally.
- Web image: nginx health check now targets `127.0.0.1` instead of `localhost`. nginx listens on IPv4 only and busybox wget tries `::1` first, so the container sat at "unhealthy" forever even though it served fine.
- Branching: GitHub default branch renamed `master` → `main` via the API (open PRs and the local checkout retarget automatically). `main` protected: the three CI job names are required status checks, branch must be up to date before merge, no force-push or deletion, no review count (solo project, same as Gotcha and Am I). CI now runs on `pull_request` and on `push` to `main` only, instead of every push to every branch. `CLAUDE.md` Git section rewritten to the shared convention: `<type>/<topic>` branches, PR into `main`, owner merges with a merge commit. The Docker stack was shut down (`docker compose down`, volumes kept) before this.
- Stale branch `claude/audit-and-redesign-ui-...` deleted after review: one commit from 2025-11-18 patching the dead generated server and restyling a client main has since rewritten; its audit list is covered by the new spec.
- Product core brainstormed and written up as `docs/superpowers/specs/2026-10-14-product-core-design.md`: a safe, not a drive; no recovery by design; handoff rules per item released by dead-man timer or k-of-n witness quorum (Shamir shares under witness keys, release key under recipient keys); irreversibility shown one fact per screen; design produced in Claude Design and reconciled here; attacker 2 (server alters the served client) deferred but kept open. The 2025 PRD and technical spec are marked superseded.
- Journal: ticked the stale "open a PR" item (PR #2 merged 2026-10-13), fixed the branch row, recorded the unmerged redesign branch and a "build the image in CI" item.

**Verified**
- `docker compose up -d --build` from a clean state: postgres, api and web all report healthy; `/api/health` through nginx returns `storage: local`.
- Client e2e suite (`vitest.e2e.config.ts`) run from Node against the live stack on :3000 with the API restarted under `API_PUBLIC_URL=http://localhost:3000/api` (Node's fetch needs absolute content URLs; browsers do not): 6/6, including a multi-chunk upload and byte-for-byte download through the volume.
- Server suite on the embedded Postgres, locally on macOS for the first time: 43/43. Server and client typecheck clean. Client unit tests 10/10.
- Both env fill-in commands run on scratch copies of the example files.

**Open**: everything in Next steps. The image had never been built before this session; CI does not build it, hence the new next-step item.

**Worth remembering**: `perl -pi` over `sed -i` in docs because the in-place flag differs between macOS and GNU sed; `\@` inside the double-quoted perl expression for the Postgres URL. The old generated sources, `project_standards/` and `server/TESTS_SUMMARY.md` still mention MinIO; they are dead or historical and were left alone.

### 2026-10-12 · cloud session · from "never run" to green CI

Session: https://claude.ai/code/session_01DRpW3oXX4GMqssrs4CpRTV
Branch: `ccr-1fec1232-1akfhk` · Commits: `fa66a9f`, `f3b09de`, `341ca35`, `85afed1`, `08311c3`

**Started with** an assessment: 23k generated lines, neither half compiled (78 + 75 type errors), zero tests had ever run, client and server spoke different APIs, and the file encryption reused one AES-GCM nonce for every chunk. Reported this, then was told to make it run and keep going.

**Did**
- Rebuilt the server against the client's API: auth with rotating refresh tokens and TOTP 2FA, files with a reserve → PUT → confirm upload flow and quota accounting, folders, anonymous share links (password, expiry, download caps), user-to-user shares, audit log, cleanup job. Storage driver abstraction: local filesystem and S3/MinIO with presigned URLs. New Prisma schema with a committed migration (the old `.gitignore` had been hiding the migrations directory).
- Fixed the client build and rewrote its crypto: PBKDF2-SHA256 at 600k iterations split into a device-only wrapping key and a server-side auth hash; random key per file; names encrypted under the file key; 1 MiB AES-GCM chunks with per-chunk nonces and chunk index and count in the AAD. Locked-vault screen with offline unlock, 2FA login step, real upload progress, share dialog and a working public share page.
- Wrote tests at three levels: server integration (Jest + supertest, embedded Postgres locally, service container in CI), client crypto units (vitest), and an end-to-end script that boots the real API and drives the real client services from Node.
- Docker Compose rebuilt (refuses placeholder secrets), GitHub Actions with three jobs, README / PROJECT_SUMMARY / SECURITY rewritten honestly.
- Added this journal and `CLAUDE.md`.

**Verified**: server 43/43, client 10/10, e2e 6/6, GitHub Actions run 1 green on all three jobs.

**Open**
- Old server sources still in tree (sandbox blocked deletion); README has the removal command.
- No PR opened; branch is pushed and green.
- Roadmap items above, recovery key first.

**Worth remembering**: the first `npm install` in the cloud produced two lockfiles that had never been committed; `prisma/migrations` was gitignored; jest must run with one worker because every suite shares a database.
