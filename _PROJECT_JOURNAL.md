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

Stage 2, the design application and the handoff subsystem (slices A witnesses, B rules and timer, C quorum) are built on `feat/handoff`, awaiting the PR. The product is a safe with a contract signup, mandatory email verification, auto-lock and the reconciled design, plus witnesses with trust on first use, handoff rules released by a timer or a witness quorum, and an end-to-end run that proves both paths byte for byte.

| Area | State |
|---|---|
| Server (Express, Prisma, Postgres) | 162 integration and unit tests on a real Postgres (jest total; each run has its own state file and a test server bound to 127.0.0.1, and the quorum file passed five runs in a row); migrations `stage2_contract_mail`, `handoff_a_witnesses`, `handoff_b_rules`, `handoff_c_quorum`; witnesses, contacts (trust on first use), rules, timer job with injectable clock, quorum requests and votes, cancel on owner activity |
| Client (React, Vite) | 237 vitest tests in 38 files; Shamir and handoff crypto, witness, rules and release services; Witnesses page, rules screens, quorum witness and owner screens, Shared-with-me rows for released items; Playwright smoke 44 tests (11 specs at 4 projects) |
| End-to-end | 11 tests, runs in CI: the stage 1 flow (7) and `handoff.e2e.test.ts` (4: timer with injected clock, quorum with a late third vote refused, cancel on owner sign-in, repair after a witness is removed) |
| Crypto | content format, KDF and key hierarchy unchanged; per-rule release key, Shamir over GF(2^8), SECURITY.md has a Handoff section |
| Ops | `WITNESS_MIN_N`, `WITNESS_MAX_N`, `WITNESS_MAY_BE_RECIPIENT` in env; handoff job runs in the API process; CI unchanged (four jobs) |
| Design | applied and extended to the handoff screens; deviations in `docs/design/decisions.md`; the owner's screenshot review is pending |
| Branch | `feat/handoff` (from `main`), PR to open |

## Next steps

- [x] Implement stage 2 and the design application (tasks 1 to 11) (2026-10-14).
- [x] Open the PR for `feat/stages-2-5` and merge it.
- [x] Owner: add `MAIL_DRIVER=log` to the local root `.env`.
- [x] Owner decision on lock at `pagehide`: keep (ruling R18).
- [x] Implement the handoff, tasks 12 to 21, on `feat/handoff`.
- [x] Open the PR for `feat/handoff` (#9, 2026-10-14), four CI jobs green.
- [ ] Owner reviews PR #9 (the `design-screenshots` artifact against the artboards, and the Decisions rows R20 to R46) and merges; delete `feat/handoff` after the merge.
- [x] Owner-visible request history for the C7 timeline: `GET /api/handoff/requests/mine` (ruling R39), landed in the final fix wave.
- [ ] API follow-ups: a Refuse action for witnesses, the witness set on the witness card.
- [ ] A durable "last seen" marker for the owner's release notice, so it does not depend on the browser.
- [ ] Moving a folder out of a covered folder should drop its files' item rows (a file move already does).
- [x] The test harness keeps per-run state in a per-run file and retries the Postgres port; the interleave tests wait for named lock waiters.
- [ ] Deferred minors from the reviews are in the PR description.
- [ ] Later stages per spec section 12: admin role; reproducible client build; hosted service; compliance readiness. Streaming uploads and passkeys remain on the supporting list. Recovery key stays ruled out by the spec.
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
| 2026-10-14 | Fonts self-hosted through `@fontsource` packages, not Google Fonts | The Docker build's CSP blocked the third-party stylesheet, and a privacy product should not contact a third party on every page load; stage 2 spec 3.1 amended |
| 2026-10-14 | Login answers 401 for a wrong credential before any verification state; 403 `EMAIL_UNVERIFIED` only with a valid credential | The spec's wording would have let anyone enumerate unverified accounts; spec 2.3 reworded |
| 2026-10-14 | Email change removed from the profile endpoint | Product spec section 5 rules it out; the UI shows the email read-only with the reason |
| 2026-10-14 | Settings' key fingerprint is the account's RSA public key (SHA-256 of SPKI), and the share dialog compares against it | The design says people who share with you compare it; the master-key fingerprint could never match |
| 2026-10-14 | No share marker on file rows until the listing carries share data | A session-only marker told two different stories about one file; the handoff slice that touches the files module adds the data |
| 2026-10-14 | Shared with me is its own route (`/shared`) and nav entry | The design's B6 is a separate screen and the four-entry nav needs a target |
| 2026-10-14 | Phone sign-out sits on the locked screen, behind Lock | The design's phone bar carries only brand and lock |
| 2026-10-14 | This sitting's PR ends at task 11; the handoff slices are the next sitting | Session-sized development: eleven tasks with review loops filled the context's share; the handoff subsystem is a coherent unit on its own |
| 2026-10-14 | Compose and `.env.example` ship `MAIL_DRIVER=log`; production defaults to `smtp` and refuses to start without `SMTP_URL` and `MAIL_FROM` | The Optional block must work for a local run; a real deployment must not silently lose verification mail |
| 2026-10-14 | R18: lock on `pagehide` stays | Spec 3.5 says so; changing a spec is the owner's call, and the cost is only that phone users relock more often than the copy promises |
| 2026-10-14 | R20: `splitForWitnesses` returns the share index with each wrapped share | The server needs the index to catch duplicate or zero indexes, and the wrapped blob is opaque to it |
| 2026-10-14 | R21: slice A ships without the rules table | Each slice must leave the product working; the rules table, the stale flag and the shares PUT arrive in slice B |
| 2026-10-14 | R25: the witness invitation link carries the row id, no token | Accepting is an authenticated act by an account holder, so a bearer token in the link would add a second credential for nothing |
| 2026-10-14 | R26: the witness set size counts invited and accepted rows only | A declined or removed witness cannot hold a share, so counting them would let a threshold be picked that nobody can reach |
| 2026-10-14 | R27: public-key lookup answers 404 for an unverified account | Nothing may address an unverified account, and the lookup must not reveal that one exists |
| 2026-10-14 | R28: a rule on a folder covers its whole subtree | The spec says every file under the folder; skipping subfolders would hand over less than the owner saw |
| 2026-10-14 | R29: the owner-activity hook lives in the throttled touch and in check-in | One place, already throttled, already on every authenticated request |
| 2026-10-14 | R30: a changed contact key blocks share and invite until re-trusted | A changed key must be a loud warning, never silent; marking the key verified in person is the deliberate way through |
| 2026-10-14 | R31: fingerprint comparison uses the 128-bit displayed prefix | The client has shown 32 hex since stage 2b and 128 bits is ample for trust on first use; the full value stays server side |
| 2026-10-14 | R32: the Witnesses page stages every change behind one confirmation | The spec and artboard stage changes before saving; the client, not the server, decides when to call |
| 2026-10-14 | R33: download-url admits recipients of released rules | Without it the Shared-with-me rows from a release could not be fetched; it serves ciphertext only |
| 2026-10-14 | R34: a file moved out of a covered folder leaves the rule | The owner put a rule on a place, and what they take out of it must not be released quietly |
| 2026-10-14 | R35: revoke clears the owner's wrapped release key | The spec deletes revoked blobs and the owner never needs that copy again |
| 2026-10-14 | R36: the 90 % subject reads "1 day" when the count is 1 | The copy row gives a placeholder, not a rule to print bad grammar; the final warning covers today |
| 2026-10-14 | R37: open requests are cancelled on login and on every owner-initiated handoff write; vote shares are tied to one split | A quorum must never run against a living owner, and a release must never combine shares from two different splits |
| 2026-10-14 | R38: the cancel mail wording follows the reason | The design row covers only the sign-in case, and a mail must not state a false cause |
| 2026-10-14 | R39: an owner request history endpoint for the C7 timeline | The spec asks for one line each with who and when, and the API had no owner-visible history; Refuse and the witness set on the card remain follow-ups |
| 2026-10-14 | R40: a timer release waits for the final warning, or for a day past the period if it cannot be sent | Spec 7.4 orders reminders, final warning, release, so the owner gets a last chance; a mail outage must not keep a dead owner's rule armed forever |
| 2026-10-14 | R41: create and re-split carry the k the shares were split with; the server refuses a mismatch with 409 THRESHOLD_CHANGED under a lock on the owner's row | Shares split for one k under a threshold of another release a key nobody can rebuild, irreversibly |
| 2026-10-14 | R42: a witness who deletes their account first leaves each set they serve: open requests cancelled, rules flagged stale, k refit | Spec 7.1 says a changed set re-splits, and a silent dead slot can leave a quorum unreachable with no signal |
| 2026-10-14 | R43: the Witnesses page warns about a witness who is also a recipient on an open rule | Decision 6 names both the rule form and the Witnesses page |
| 2026-10-14 | R44: witness keys are checked against the owner's trust rows at create and repair; recipient keys at vote time are not, and SECURITY.md says so with the server's power to release alone | The safe must not claim a check it does not make |
| 2026-10-14 | R45: the owner gets no mail for their own rule creation or revocation | Spec 7.2's "every state change is emailed" is read as changes that happen to the owner; a mail confirming one's own click is noise |

## Session log

### 2026-10-14 · local (Claude Code) · handoff subsystem built on feat/handoff (tasks 12 to 21 of 21)

Session: Claude Code, local checkout (https://claude.ai/code/session_01N3pACkpAt4i9g2h7TPtvoa) · Branch: `feat/handoff` · Commits: `e8587e4` … `8a35a74` (33 commits, plus this journal commit) · PR: https://github.com/joemc3/CrypticStorage/pull/9

**Did**
- Verified the owner's recreated root `.env` (all keys present, both secrets filled), booted the Docker stack, `/api/health` answered. Owner decision recorded: lock on `pagehide` stays.
- Ran plan tasks 12 to 21 subagent-driven: one implementer and one reviewer per task, fix rounds where the review found Important issues (tasks 13, 14, 15, 17 one each; task 19 four, the last with a fresh implementer), one whole-branch review, one fix wave re-reviewed, then one narrow residual fix (ruling R46) for two release-path findings the final review surfaced outside its brief. Rulings R20 to R46 are in the Decisions table.
- Client crypto: in-house Shamir over GF(2^8) with a known-answer vector from an independent reference; the handoff crypto service (release key, four wraps, witness re-wrap, recipient combine).
- Slice A: witnesses module and migration, trust on first use with fingerprints and a server-held trust table, Witnesses page that stages every change behind one confirmation, invitation screen.
- Slice B: rules module and migration, coverage of folder subtrees, share counts and coverage gaps on listings, timer job with injectable clock, reminders with single-use check-in tokens, release gated on the final warning, rule sheet and detail, dashboard rules, recipient notice, check-in page, repair at unlock.
- Slice C: release requests and votes with k fixed at open and vote shares tied to one split, cancellation on login, check-in, every owner-initiated handoff write and the throttled activity touch, consistent lock order, owner request history for the C7 timeline, witness dashboard section and the two one-fact screens, recipient combine in Shared with me.
- Handoff end-to-end test (timer, quorum, cancel, repair, byte for byte), SECURITY.md Handoff section written to what the code does, README, emails.md, journal.
- Test harness: per-run state file (the fixed path was clobbered by concurrent runs), Postgres port retry, test server bound to 127.0.0.1 (other programs on this Mac answered on loopback ephemeral ports and caused the long-standing stray 401s).

**Verified**: `make typecheck`; `make test` server 166 and client 239; `make test-e2e` 11/11; Playwright 44/44; the quorum file five runs in a row; CI on the PR: four jobs green (run 38668428457) after one fix: a timezone-dependent reminder-date assertion that the UTC runner caught; the test now computes its expectation through the formatter.

**Open**: owner review and merge of the PR; the owner's screenshot review of the new screens against the artboards; API follow-ups (Refuse for witnesses, the witness set on the witness card, an invited-only witness deleting their account leaves k unrefit, a durable last-seen marker for the release notice, moving a folder out of a covered folder); two timer notes (a concurrent tick can release on another tick's in-flight final-warning stamp that later rolls back; a final warning sent past 100 % quotes a past date); the deferred minors listed in the PR description. Lesson recorded: do not dispatch a successor implementer while the previous one is still running (task 19 rounds 3 and 4 overlapped on the same tree).

### 2026-10-14 · local (Claude Code) · stage 2 and the design application built on feat/stages-2-5 (tasks 1 to 11 of 21)

Session: Claude Code, local checkout · Branch: `feat/stages-2-5` · Commits: `858873f` … `560ee64` (29 commits), plus this journal commit

**Did**
- Ran the plan subagent-driven: one implementer and one reviewer per task, a fix round where the review found Important issues (tasks 2, 5, 10, 11), one whole-branch review at the end. Fifteen controller rulings are listed under Decisions.
- Stage 2: `User` gains `display_name`, `email_verified_at`, `contract_acknowledged_at`, `lock_after_minutes`, `last_activity_at`; new `email_tokens` table; one migration that backfills `email_verified_at = created_at` so alpha accounts keep signing in. Mail library with `log` (default outside production, last 100 in memory, `GET /api/_test/mail` in test only) and `smtp` (nodemailer) drivers; `MAIL_DRIVER`, `SMTP_URL`, `MAIL_FROM` in both env examples and compose. Register requires `contractPhrase` equal to `I understand there is no way back`, returns 201 with no tokens, sends a 24-hour verify link; `verify-email`, `resend-verification` (always 202), login gate `403 EMAIL_UNVERIFIED` after bcrypt; cleanup deletes unverified accounts after 7 days. Profile PATCH takes `displayName` and `lockAfterMinutes` (1 to 30) without a password; email change removed. Activity touch in the auth middleware, one `updateMany` per 5 minutes. Client: four `OneFact` contract screens, verify page, no forgot-password link, idle lock (`lib/idle.ts`, `useIdleLock`), locked screen, sidebar lock footer and phone lock button, Settings "Lock and look" (lock period, theme), theme via `data-theme` on `<html>`.
- Stage 2b: tokens, fonts and the Tailwind mapping; every existing screen restyled to its artboard (public pages, layouts with the four-entry nav and a `/shared` route, dashboard, locked, files, preview, share dialog with a new user tab and fingerprint, shared with me, settings with the phone index, base components); five new list components (`Breadcrumbs`, `ListRow`, `StateBadge`, `Fingerprint`, `EmptyState`); old indigo palette, `.btn`/`.card`/`.input` classes, recharts and framer-motion uses removed; Playwright smoke under `client/e2e-browser/` (28 checks, 90 screenshots at 1280 and 390, light and dark, from a committed vault fixture plus mocked API) in the CI client job with a `design-screenshots` artifact.
- Not started: tasks 12 to 21 (Shamir, handoff crypto, witnesses, rules, timer, quorum, handoff e2e). The product works without them; their slots on the dashboard, rows and settings render nothing.

**Verified**: server typecheck and 61 tests on embedded Postgres; client type-check, 89 vitest tests, build; `make test-e2e` 7 of 7 (register → mail link → verify → login → lock period 1 → forced lock → unlock, plus the existing flow); Playwright 28 of 28 locally. CI on the PR: see the PR checks (pushed at the end of this session).

**Open**: Whole-branch review returned "with fixes"; the fix wave (fonts self-hosted, share bound to the verified key, register survives a failed mail send, resend feedback, dead dependencies removed, README and SECURITY.md updated, seven decisions rows) landed and was re-reviewed. Still deferred from the reviews, all minor: `OneFact` cancel unused by the wizard; profile schema not `.strict()`; activity touch queries on every request; theme radios lack arrow keys; `Modal` md equals lg; components README partly stale; a verify-token expiry test; `UnlockForm` says "1 minutes". Known gap: no share marker on file rows until the file listing carries share data (planned for handoff slice B). Deferred minors from the per-task reviews are listed in the PR description. The owner's local root `.env` has no `MAIL_DRIVER` line; `make up` will fail env validation until it has `MAIL_DRIVER=log` (or smtp with its two values). Google Fonts load from `index.html` per the stage 2 spec; a third-party fetch on every page load is worth a deliberate decision for a privacy product.

### 2026-10-14 · local (Claude Code) · design reconciled; specs and plan for stages 2 to 5

Session: Claude Code, local checkout (same session as stage 1) · Branch: `design/visual-proposal` · Commits: `23adbc3`, `5a09be5`, plus this journal commit

**Did**
- Reconciled the Claude Design output against the product spec with the owner: 14 decision rows in `docs/design/decisions.md`. Owner chose an optional display name, a lock-after selector defaulting to 5 minutes, full-screen irreversible confirmations, and no re-arming of released rules; the rest adopt the design's placements. Spec amended in four places; the brief's lock constraint corrected.
- Wrote three specs sized to what the next session can build: stage 2 (contract, email verification with a `log|smtp` mail driver, auto-lock with raw keys in memory only, display name, theme), stage 2b (apply the design to existing screens, Playwright smoke), stages 3 to 5 (handoff: witnesses with trust-on-first-use, rules with owner-held release key, in-house Shamir over GF(256), timer job with injectable clock and check-in links, quorum with re-wrapped shares, cancel on owner activity). One plan of 21 tasks for subagent-driven execution.
- Owner refined the sizing rule: size work by what fits sanely in a session's context; recorded in `CLAUDE.md`, the vault and memory.

**Verified**: documents only; no code changed. The "key changed" callout described in the design write-up is not drawn in the share dialog source, noted in decisions as an implementation item.

**Open**: PR for this branch; next session starts `feat/stages-2-5`.

### 2026-10-14 · Claude Design (cloud, linked to local checkout) · design proposal written to docs/design/output

Session: https://claude.ai/code/session_01X2wVZKrUVyoTw8L6FuugFm · Branch: `design/visual-proposal` (from `chore/stage-1-cleanup-and-brief`, which is not yet merged) · Commits: `0fcf592`, plus this journal commit

**Did**
- Read the brief, the product core spec and the decisions file; produced the design on a private Claude Design canvas owned by the owner (24 artboards: design system, component sheet, every screen in A to F at desktop 1280 light, phone 390 light and phone 390 dark, with extra phones for multi-step flows).
- Wrote to `docs/design/output/`: `README.md` (what to hold on to, where implementers have latitude), `design-system.md`, `tokens.css` (`:root`, `prefers-color-scheme`, `data-theme` override, Tailwind mapping in a comment), `screens.md` (one paragraph per screen), `emails.md` (13 templates), `open-questions.md` (12 reconciliation candidates), and `canvas/` with the artboard sources and `cs.css`.
- Direction: "document of record". Newsreader serif only for sentences that carry consequences; Instrument Sans for everything operational; IBM Plex Mono for fingerprints and codes; one vault-green accent; every irreversible act is the same full-screen one-fact layout, never a modal.

**Verified**: a script over the artboard sources finds every verbatim sentence from `03-screens-and-flows.md` unchanged. No code touched, so no test run. Text tokens checked for 4.5:1 against their grounds by calculation, not by tool.

**Open**: reconcile into `docs/design/decisions.md`. The biggest questions: `{name}` renders as an email because accounts have no display name; the brief fixes auto-lock at five minutes while the spec makes it configurable; two emails were added beyond the brief's list.

**Worth remembering**: no email can name an item, because the server cannot read names; the email copy says "what the rule covers". The `.dc.html` files under `canvas/` render only inside Claude Design (they need its runtime); read them as annotated HTML.

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
