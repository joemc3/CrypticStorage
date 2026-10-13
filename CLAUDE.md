# CrypticStorage – working agreements for Claude sessions

## The project journal is mandatory

`_PROJECT_JOURNAL.md` at the repo root is the owner's bridge to their Obsidian vault. It is the only record of a cloud session that survives, so:

1. **Every session that changes anything appends a dated entry** under `## Session log` (newest first) before it ends: what was done, what was verified (test counts, CI result), what is open, and anything the next session would otherwise have to rediscover. Link the session and the commits. Keep it factual.
2. **Overwrite, do not append, the snapshot sections** `## Current state`, `## Next steps` and `## Decisions` so they always describe now. Tick finished items off the checklist rather than deleting them within the same session; delete them the session after.
3. **Bump `modified` in the frontmatter** to today's date. Never change `created`.
4. **Commit the journal with the work**, or as its own commit at the end of the session if the work is already committed. Push it.
5. **If this session can reach the owner's Obsidian vault** (a local session on their machine), run the sync described under `## How to sync this into the vault` in the journal, then set `vault_synced_through` to the newest synced entry date, commit and push. Cloud sessions cannot reach the vault and must not pretend to.

The frontmatter follows the vault's conventions: `status/*` and `type/*` tags, `created`/`modified` as ISO dates, wiki-links allowed.

## How to run and verify

- `make install` once. Node 22.
- `make test` runs the server integration suite (boots an embedded Postgres) and the client unit tests. `make test-e2e` runs the real API with the real client crypto. `make typecheck` for both halves.
- CI (`.github/workflows/ci.yml`) runs the same three things. Do not push a change without running at least the suite that covers it.
- Local dev without Docker: `make dev-db`, then `make dev-api` and `make dev-web` with a `server/.env` built from `server/.env.example`.

## Code conventions that matter here

- The client's API types in `client/src/services/api.service.ts` are the contract. Change the server to match the client, not the reverse, unless the change is discussed in the journal's Decisions table.
- Everything cryptographic lives in `client/src/services/crypto.service.ts`. Changing the content format, the KDF or the key hierarchy needs a new format version, a migration story and a line in `SECURITY.md`.
- The server never receives plaintext names, content or keys. If a change would send any of those, it is wrong.
- Server tests share one database; jest runs with `maxWorkers: 1` on purpose.
- The old generated sources under `server/src/{controllers,routes,services,utils}`, `server/src/config/{database,redis,storage}.ts`, `server/src/middleware/*.middleware.ts` and `server/tests/{unit,integration}` are dead and excluded from builds. Delete them when the environment allows; do not import from them.

## Git

- Work on the branch the session was given. Do not open a pull request unless asked.
- Commit messages explain why, not just what.
