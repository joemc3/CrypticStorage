# CrypticStorage

Zero-knowledge, end-to-end encrypted file storage. Files, file names and folder names are encrypted in the browser with keys that never leave it. The server stores ciphertext, wrapped keys and metadata it cannot read.

**📓 Journal:** [`_PROJECT_JOURNAL.md`](_PROJECT_JOURNAL.md) is the structured, agent-readable log of every working session: current state, next steps, decisions, and a dated session log. Read it first; append to it last.

**Status:** working alpha. Both halves compile, the API has an integration suite against a real Postgres, the crypto has unit tests, and an end-to-end run exercises the real client against the real server. It has not had an external security review. See [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for what exists, what is missing and the roadmap, and [SECURITY.md](SECURITY.md) for the threat model.

## What it does

- **Accounts without a password on the server.** The password feeds a PBKDF2-SHA256 derivation (600k iterations) whose output is split into a wrapping key that stays on the device and an authentication hash that is the only credential the server ever sees (and bcrypts).
- **Per-file keys.** Every file gets a random AES-256 key, wrapped with the account's master key. File content is sealed in 1 MiB AES-GCM chunks with a per-chunk nonce and the chunk index and count in the authenticated data, so chunks cannot be reordered, dropped or duplicated.
- **Sharing that stays zero-knowledge.** Anonymous links carry the file key in the URL fragment, which browsers never send to the server; the server can still enforce passwords, expiry and download caps. User-to-user shares wrap the file key with the recipient's RSA-OAEP public key.
- **Two-factor authentication** with TOTP and single-use backup codes, a locked-vault screen after reload that unlocks offline, password change by re-wrapping the master key, refresh-token rotation, quotas, an audit log.
- **Storage drivers.** Local filesystem for development, tests and single-node deployments; any S3-compatible store (MinIO, S3, R2) for production, with optional presigned URLs straight from the browser.

## Run it

Both paths need a one-time setup that creates an env file with generated secrets. After that, starting the app is one command. The two paths use different env files: Docker reads the root `.env`, the no-Docker path reads `server/.env`.

### Docker (recommended)

**First time only.** Three values in `.env` are required and have no default; everything else can stay as it is.

```bash
cp .env.example .env
perl -pi -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|;
             s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 24)|;
             s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)|" .env
```

**Every time.**

```bash
make up            # docker compose up -d --build
open http://localhost:3000
make down          # when finished
```

The stack refuses to start with empty or placeholder secrets. MinIO's console is on http://localhost:9001.

### Without Docker

Node 22 is required.

**First time only.** Install dependencies and create `server/.env`. Two values need setting: `JWT_SECRET` (at least 32 characters) and the `DATABASE_URL` of the embedded Postgres that `make dev-db` serves on port 54321 (the example file's 5432 is for a regular local Postgres). Keep `STORAGE_DRIVER=local`; files go under `server/data/storage` and no S3 values are needed. The client needs no env file.

```bash
make install
cp server/.env.example server/.env
perl -pi -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|;
             s|^DATABASE_URL=.*|DATABASE_URL=postgresql://postgres:postgres\@127.0.0.1:54321/crypticstorage|" server/.env
```

**Every time**, three terminals:

```bash
make dev-db        # terminal 1: embedded Postgres on :54321
make dev-api       # terminal 2: API on :4000
make dev-web       # terminal 3: web app on :3000, proxies /api to :4000
```

## Test it

```bash
make test          # server integration suite (boots an embedded Postgres) + client crypto unit tests
make test-e2e      # starts a real API and drives the real client services through register → upload → share
make typecheck
```

CI runs all three on every push (`.github/workflows/ci.yml`), using a Postgres service container.

## Layout

```
server/   Express + Prisma API. src/modules/{auth,users,files,folders,shares}, src/storage/{local,s3}.
          tests/api are HTTP-level integration tests; tests/lib are unit tests.
client/   React + Vite app. src/services/crypto.service.ts is the whole cryptographic design;
          auth/file/share services sit on top of it. e2e/ drives those services against a live API.
scripts/  e2e.sh (no-Docker end-to-end run), count-loc.sh
```

### API in one screen

All routes live under `/api` and return `{ success, data }` or `{ success: false, message, code, errors? }`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/verify-2fa`, `/auth/refresh`, `/auth/logout` |
| Users | `GET/PATCH/DELETE /users/profile`, `GET /users/public-key?email=`, `POST /users/2fa/{setup,enable,disable,backup-codes}`, `GET /storage/stats`, `GET /activity` |
| Files | `GET /files`, `POST /files/upload-url` → `PUT <uploadUrl>` → `POST /files/:id/confirm`, `GET /files/:id`, `GET /files/:id/download-url`, `PATCH /files/:id`, `POST /files/:id/{move,copy}`, `DELETE /files/:id` |
| Folders | `GET/POST /folders`, `GET/PATCH/DELETE /folders/:id`, `POST /folders/:id/move` |
| Sharing | `POST/GET /shares/links`, `DELETE /shares/links/:id`, `GET /files/:id/links`, `GET /shares/public/:token`, `POST /shares/public/:token/download-url`, `POST /shares`, `GET /shares/with-me`, `GET /files/:id/shares`, `DELETE /shares/:id` |

Uploads are a three-step reservation so the server can verify size and quota before a file becomes visible. When the storage driver can presign (S3 with `S3_PUBLIC_ENDPOINT`), the upload and download URLs point straight at object storage; otherwise they point at `/api/files/:id/content` with a short-lived token and the API streams the bytes.

## Configuration

Everything is read from the environment and validated at startup (`server/src/config/env.ts`). The important ones:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | ≥32 chars; placeholders are rejected in production |
| `STORAGE_DRIVER` | `local` or `s3` |
| `STORAGE_LOCAL_PATH` | directory for the local driver |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | S3 driver |
| `S3_PUBLIC_ENDPOINT` | endpoint browsers can reach; enables presigned URLs |
| `APP_URL` | web app origin, used for share links and CORS |
| `API_PUBLIC_URL` | leave empty when `/api` is proxied on the app's origin |
| `DEFAULT_STORAGE_QUOTA_BYTES`, `MAX_FILE_SIZE_BYTES` | limits |

## Repository cleanup still pending

The original generated server sources are still present under `server/src/{controllers,routes,services,utils}`, `server/src/config/{database,redis,storage}.ts`, `server/src/middleware/*.middleware.ts` and `server/tests/{unit,integration,setup.ts}`. They are excluded from the build, the tests and the Docker image. Delete them with:

```bash
git rm -r server/src/controllers server/src/routes server/src/services server/src/utils \
  server/src/config/database.ts server/src/config/redis.ts server/src/config/storage.ts \
  server/src/middleware/*.middleware.ts server/src/middleware/index.ts \
  server/tests/unit server/tests/integration server/tests/setup.ts server/tests/README.md
```

and drop the matching `exclude` entries from `server/tsconfig.json`, `server/tsconfig.test.json` and `server/.dockerignore`.

## License

MIT
