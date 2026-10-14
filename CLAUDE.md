# CrypticStorage – working agreements for Claude sessions

## Keep the project journal current

`_PROJECT_JOURNAL.md` at the repo root is the record of what happened here. The owner's own agents read it from outside this repo and apply their own rules; this repo does not know or care how. Your only job is to keep it accurate and in the fixed structure described at the top of the file.

Every session that changes anything:

1. Appends one dated entry under `## Session log`, newest first, with the heading form `YYYY-MM-DD · <where it ran> · <one-line summary>`. Say what was done, what was verified (test counts, CI result), what is open, and anything the next session would otherwise have to rediscover. Link the session and the commits. Facts only.
2. Overwrites the snapshot sections `## Current state`, `## Next steps` and `## Decisions` so they describe now. Tick finished items rather than deleting them within the same session; drop them the session after.
3. Sets `updated` and `last_session` in the frontmatter. Does not add other frontmatter fields or change the section order; agents downstream parse it.
4. Commits the journal with the work, or as its own commit at the end, and pushes.

## How to run and verify

- `make install` once. Node 22.
- `make test` runs the server integration suite (boots an embedded Postgres) and the client unit tests. `make test-e2e` runs the real API with the real client crypto. `make typecheck` for both halves.
- CI (`.github/workflows/ci.yml`) runs the same three things. Do not push a change without running at least the suite that covers it.
- Local dev without Docker: `make dev-db`, then `make dev-api` and `make dev-web` with a `server/.env` built from `server/.env.example`.

## Code conventions that matter here

- The client's API types in `client/src/services/api.service.ts` are the contract. Change the server to match the client, not the reverse, unless the change is recorded in the journal's Decisions table.
- Everything cryptographic lives in `client/src/services/crypto.service.ts`. Changing the content format, the KDF or the key hierarchy needs a new format version, a migration story and a line in `SECURITY.md`.
- The server never receives plaintext names, content or keys. If a change would send any of those, it is wrong.
- Server tests share one database; jest runs with `maxWorkers: 1` on purpose.

## Git

Same convention as the owner's other repositories (Gotcha, Am I, tuPoint).

- `main` is the only long-lived branch. Never commit to it directly; it is protected and requires the three CI jobs to pass before a merge.
- Every change goes on a short-lived branch named `<type>/<topic>` and lands through a pull request into `main`. Types in use: `feat/`, `fix/`, `docs/`, `chore/`, `spec/`, `plan/`, `design/`. Keep the topic short and in kebab-case (`fix/empty-env-values`, `spec/recovery-key`).
- At session start, check the branch. If it is `main`, create the branch for the work before changing anything.
- Push the branch and open the pull request when the work is verified; the title says what changed and the description says why. The owner merges with a merge commit; do not merge or force-push.
- Delete the branch after it is merged. Branches named `claude/...` or `ccr-...` were created by hosted sessions; treat them as pull-request candidates to review, not as long-lived branches.
- Commit messages explain why, not just what.
