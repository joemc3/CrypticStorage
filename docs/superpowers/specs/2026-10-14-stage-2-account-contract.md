# Stage 2: the account contract, email, auto-lock

Date: 2026-10-14. Implements stage 2 of `2026-10-14-product-core-design.md` (sections 5 and 8) and the reconciled design in `docs/design/decisions.md` rows 1 to 3. Read the product core spec first; this document only adds what is needed to build.

## 1. Outcome

A new account is created only after the person has acknowledged, one fact per screen, that there is no reset, no email change, and that witnesses can release their items. Their email is verified before they can sign in. The vault locks itself after an idle period they choose. The account can carry a display name. Light and dark follow the design tokens.

## 2. Server

### 2.1 Schema (one migration)

`User` gains:

| Column | Type | Notes |
|---|---|---|
| `display_name` | `String?` (≤ 64) | server-visible, not secret; shown wherever the design says {name}, else the email |
| `email_verified_at` | `DateTime?` | null until the verification link is used |
| `contract_acknowledged_at` | `DateTime` | set at register; the register request must carry the exact phrase |
| `lock_after_minutes` | `Int` default 5 | 1 to 30, validated |
| `last_activity_at` | `DateTime` default now | touched by authenticated requests at most once per 5 minutes; the handoff timer reads it later |

New model `EmailToken`: `id`, `user_id`, `purpose` (`verify_email` now; `check_in` later), `token_hash` (SHA-256 of a 32-byte random token, unique), `expires_at`, `used_at`, `created_at`. Index on `user_id, purpose`.

### 2.2 Mail

`server/src/lib/mail.ts` exports `sendMail({ to, subject, text, html? })` and `outbox()`. Driver from `MAIL_DRIVER`:

- `smtp`: nodemailer with `SMTP_URL` (`smtp://user:pass@host:port` or `smtps://`) and `MAIL_FROM`. Required in production; env validation fails without them when `MAIL_DRIVER=smtp`.
- `log` (default outside production): writes each message to the logger at `info` and keeps the last 100 in memory; `outbox()` returns them. When `NODE_ENV=test`, `GET /api/_test/mail?to=` returns the outbox so the end-to-end run can fetch links. The route is not mounted in any other environment.

Templates live in `server/src/mail/templates.ts` as functions returning `{ subject, text }`. Copy comes from `docs/design/output/emails.md`. No email ever contains a file or folder name.

### 2.3 Register

`POST /api/auth/register` gains `displayName?: string` and `contractPhrase: string`. The phrase must equal `I understand there is no way back` exactly or the request fails `400 CONTRACT_NOT_ACKNOWLEDGED`. On success: user created with `contract_acknowledged_at = now`, audit `user.contract_acknowledged`, a `verify_email` token (24 h) sent, response `201 { verificationRequired: true }` with **no tokens**. The client goes to "check your email".

`POST /api/auth/verify-email { token }`: finds the unused, unexpired token, sets `email_verified_at`, marks the token used, audit `user.email_verified`, returns `200 { email }`. Invalid or expired: `400 TOKEN_INVALID`.

`POST /api/auth/resend-verification { email }`: always `202`, sends a new token only if the account exists and is unverified. Rate limited like login (`authLimiter`).

`POST /api/auth/login`: an unverified account gets `403 EMAIL_UNVERIFIED` before any credential check result is revealed; the bcrypt compare still runs so timing stays flat.

Cleanup job: unverified accounts older than 7 days are deleted with their tokens.

### 2.4 Profile

`PATCH /api/users/profile` accepts `displayName` (string, ≤ 64, or `null` to clear) and `lockAfterMinutes` (1 to 30). `GET /api/users/profile` returns both plus `emailVerifiedAt`. The DTO in `server/src/modules/dto.ts` adds the three fields; the client types in `api.service.ts` match.

### 2.5 Activity touch

`middleware/auth.ts`, after a token is accepted: if `last_activity_at` is older than 5 minutes, update it. One `UPDATE` at most per 5 minutes per user. No audit row.

## 3. Client

### 3.1 Design tokens and shared components

- `docs/design/output/tokens.css` is copied to `client/src/styles/tokens.css` and imported first in `index.css`; `tailwind.config.js` maps `fontFamily` and colours to the tokens as the comment in that file shows. The fonts (Newsreader, Instrument Sans, IBM Plex Mono) load from Google Fonts in `index.html`.
- New `components/common/OneFact.tsx`: props `{ fact: string; supporting?: string; action: { label; onClick; disabled?; danger? }; back?: () => void; cancel?: () => void; children? }`. Full screen, no app chrome, serif fact at top, one primary action, quiet Back, quiet Cancel top right. Every irreversible act in every later stage uses it.
- Theme: `ui.store` gains `theme: 'system' | 'light' | 'dark'` persisted in `localStorage`; sets `data-theme` on `<html>` for the two explicit values and removes it for system.

### 3.2 Register flow (`/register`)

Four `OneFact` screens with the verbatim lines from `docs/design/brief/03-screens-and-flows.md` A2, in order; the fourth has a text field and its action enables only when the field equals the phrase. Then the form: email, display name (optional, labelled as visible to people you share with), password, confirm, strength line. Submit calls `AuthService.register(email, password, displayName, phrase)`. Then "check your email" with the address and a Resend action that calls resend-verification. Browser back from the form returns to screen four; the acknowledgement is not stored anywhere before the account exists.

### 3.3 Verify (`/verify/:token`)

Calls verify-email on mount; one line of success with Sign in, or one line of failure with a Resend form.

### 3.4 Sign in

No forgot-password link; the small verbatim line in its place. `EMAIL_UNVERIFIED` shows "check your email" with Resend.

### 3.5 Lock

- Raw keys (wrapping key, master key, private key) live only in a module-level variable in `StorageService`; wrapped blobs may stay in `localStorage` so unlock works offline. Audit the current `StorageService` and move any raw key out of persistent storage.
- `lib/idle.ts`: an idle timer reset by `pointerdown`, `keydown`, `scroll`, `visibilitychange` (visible). When idle for `lockAfterMinutes`, call `AuthService.lock()`, which clears raw keys and sets status `locked`. Also lock on `pagehide`.
- Locked screen `/unlock` per artboard B1: email, password, Unlock, the small "locks after N minutes idle" line, Sign out. Desktop sidebar footer shows "Unlocked · locks after N min idle" with Lock now; phone top bar has the lock button.

### 3.6 Settings

Per artboard B7: Profile shows the email read-only with the reason, and the display name editable. New "Lock and look" section: Lock after (1, 2, 5, 10, 15, 30) and Theme (System, Light, Dark).

## 4. Tests

- Server (Jest, embedded Postgres): register without the phrase → 400; with it → 201 and one message in the outbox addressed to the email; login before verify → 403; verify with the token from the outbox → 200; login after → 200; verify twice → 400; resend for unknown email → 202 and no message; profile PATCH rejects `lockAfterMinutes` 0 and 31 and `displayName` of 65 chars; activity touch updates `last_activity_at` once within 5 minutes; cleanup deletes a 7-day-old unverified user.
- Client (Vitest): `OneFact` renders the fact and disables the action when `disabled`; the register wizard cannot reach the form without the exact phrase; `idle.ts` fires after the configured minutes under fake timers and resets on activity; theme store sets and removes `data-theme`.
- End-to-end: register → fetch the link from `/api/_test/mail` → verify → login → set lock to 1 minute → unlock after a forced lock. The existing e2e register helper is updated to pass the phrase and verify.

## 5. Not in this stage

Witnesses and the third contract screen's promise are built in the handoff stage; the screen still shows now because the contract must be complete from day one. Admin, reproducible build, passkeys.
