# Stages 3 to 5: handoff rules, witnesses, timer and quorum

Date: 2026-10-14. Implements stages 3, 4 and 5 of `2026-10-14-product-core-design.md` (section 7 in full, section 5 public key trust) and decision rows 4 to 11 of `docs/design/decisions.md`. One subsystem, one spec, built in three slices that each leave the product working.

## 1. Slices

- **Slice A, witnesses.** Invite, accept, decline, remove; threshold; key fingerprints with trust on first use; the Shamir primitive. Nothing can be released yet.
- **Slice B, rules and the timer.** Create, list, revoke; release key wrapped for owner, recipients and witnesses; coverage of folders; activity, reminders, check-in, release by timer; recipient sees the item.
- **Slice C, quorum.** Open a request, vote, cancel on owner activity, release when k votes are in.

## 2. Cryptography in the client

All in `client/src/services/`, pure functions, unit tested.

- `shamir.ts`: Shamir secret sharing over GF(2^8) with the AES polynomial, byte-wise, as in the Vault and HashiCorp implementations. `split(secret: Uint8Array, n: number, k: number): Uint8Array[]` returns n shares of `secret.length + 1` bytes, last byte the x-coordinate (1..n). `combine(shares: Uint8Array[]): Uint8Array` with any k distinct shares. Written in-house, about 120 lines, so reviewers can read it; tests include split-combine round trips for every (n, k) in bounds, failure with k-1 shares, and a fixed vector.
- `handoff.service.ts`:
  - `createReleaseKey(): CryptoKey` (AES-256, extractable).
  - `wrapForOwner(releaseKey, masterKey): EncryptedData`; `wrapForUser(releaseKey, publicKey): string` (RSA-OAEP, reuses `wrapKeyForRecipient`); `wrapFileKeyUnderRelease(fileKey, releaseKey): EncryptedData`.
  - `splitForWitnesses(releaseKey, witnessPublicKeys: Map<userId, CryptoKey>, k): Map<userId, string>`: exports the raw key, splits n = size, k, wraps share i under witness i's public key.
  - `rewrapShareForRecipient(wrappedShare, myPrivateKey, recipientPublicKey): string` (witness side).
  - `combineAndUnwrap(shares: string[], myPrivateKey): CryptoKey` (recipient side): unwrap each with the private key, combine, import as AES.

## 3. Server schema (one migration per slice)

Slice A:

- `witnesses`: `id`, `owner_id`, `witness_user_id`, `status` enum `invited|accepted|declined|removed`, `invited_at`, `responded_at`. Unique `(owner_id, witness_user_id)`. A user cannot be their own witness.
- `users.witness_threshold` `Int` default 2.
- `trusted_keys`: `id`, `user_id`, `contact_user_id`, `fingerprint` (SHA-256 of SPKI, hex), `verified_in_person` bool default false, `first_seen_at`, `last_seen_at`. Unique `(user_id, contact_user_id)`.

Slice B:

- `handoff_rules`: `id`, `owner_id`, `file_id?`, `folder_id?` (exactly one), `period_days` int, `state` enum `active|warning|released_timer|released_quorum|revoked`, `wrapped_release_key_owner` (JSON blob under master key), `created_at`, `reminded_75_at?`, `reminded_90_at?`, `reminded_95_at?`, `released_at?`, `revoked_at?`.
- `handoff_rule_recipients`: `rule_id`, `user_id`, `wrapped_release_key` (RSA-OAEP b64), `notified_at?`. PK `(rule_id, user_id)`.
- `handoff_rule_items`: `rule_id`, `file_id`, `wrapped_file_key` (JSON blob under release key). PK `(rule_id, file_id)`.
- `handoff_rule_shares`: `rule_id`, `witness_user_id`, `wrapped_share` (RSA-OAEP b64), `share_index` int. PK `(rule_id, witness_user_id)`.
- `email_tokens.purpose` gains `check_in`.

Slice C:

- `release_requests`: `id`, `owner_id`, `opened_by_user_id`, `state` enum `open|cancelled|completed`, `opened_at`, `closed_at?`.
- `release_votes`: `request_id`, `witness_user_id`, `voted_at`. PK `(request_id, witness_user_id)`.
- `release_vote_shares`: `request_id`, `witness_user_id`, `rule_id`, `recipient_user_id`, `wrapped_share` (RSA-OAEP under the recipient's public key). PK on all but the blob.

The server stores every blob opaque. It never holds a release key, a share in clear, or a file key.

## 4. API

Slice A, under `/api/witnesses`:

- `GET /` owner's set with status and threshold. `PUT /threshold { k }` within 2..n and the global bounds (`WITNESS_MIN_N=2`, `WITNESS_MAX_N=7` env, defaults as spec). `POST / { email }` invites (account must exist and be verified; `404 NO_ACCOUNT` otherwise); emails the invitee. `DELETE /:id` removes. `GET /invitations` for the invitee; `POST /invitations/:id/accept|decline`.
- `GET /api/users/public-key?email=` already exists; it now also returns `fingerprint` and the caller's `trusted_keys` row if any. `PUT /api/contacts/:userId/trust { verifiedInPerson }`. The client compares the fingerprint with the stored one on every fetch and shows the loud warning on mismatch (decision 7).
- Changing the witness set or threshold while active rules exist: the server returns the list of active rules; the client re-splits every rule's release key (it holds `wrapped_release_key_owner`) and `PUT /api/handoff/rules/:id/shares` replaces the shares in one transaction. A rule with stale shares is flagged `shares_stale` in listings until repaired; the client repairs at next unlock.

Slice B, under `/api/handoff`:

- `POST /rules { fileId | folderId, periodDays, recipients: [{ userId, wrappedReleaseKey }], items: [{ fileId, wrappedFileKey }], shares: [{ witnessUserId, shareIndex, wrappedShare }], wrappedReleaseKeyOwner }`. Server checks: recipients exist and are verified; shares cover exactly the accepted witnesses; items cover every file under the folder (server lists them; the client must wrap all); `periodDays` in {30, 90, 365, 1825, 3650} or custom 7..3650. Emails each recipient the notice (C5). Audit.
- `GET /rules` owner's rules with state, next check-in date, coverage flag. `GET /rules/:id`. `DELETE /rules/:id` revokes (state `revoked`, blobs deleted, recipients emailed). `PUT /rules/:id/shares` as above. `PUT /rules/:id/items` adds wrapped file keys for files added to a covered folder; the files module lists `coverageGaps` on folder metadata so the client wraps on upload or move and repairs at unlock.
- `GET /for-me` recipient view: rules naming me, with state and, when released, `wrappedReleaseKey` plus items. Released items also appear in `/api/shares/with-me` with `handoff: { from, releasedAt, by: 'timer'|'quorum' }` so the existing Shared-with-me view shows them (decision B6).
- `POST /api/auth/check-in { token }` public: a `check_in` token from a reminder email sets `last_activity_at`. Tokens expire 30 days.

Timer job `server/src/jobs/handoff.ts`, every 15 minutes: for each `active|warning` rule, `elapsed = now - owner.last_activity_at`, `period = period_days`. At 75 %: state `warning`, reminder email with a check-in link, `reminded_75_at`. At 90 % and 95 %: further reminders. At 100 %: state `released_timer`, `released_at`, emails to owner and each recipient. Reminders are deduplicated per owner per tick. When the owner's activity moves, every `warning` rule returns to `active` and the reminder stamps clear.

Slice C, under `/api/handoff/requests`:

- `POST / { ownerId }` by an accepted witness; one open request per owner; emails owner and witnesses. `GET /` requests I am a witness on, with votes. `POST /:id/votes { shares: [{ ruleId, recipientUserId, wrappedShare }] }`: the witness unwraps their share for each active rule and re-wraps it per recipient; the server stores them, emails owner and witnesses; when votes ≥ threshold, every `active|warning` rule becomes `released_quorum`, recipients are emailed, request `completed`.
- Cancel: the auth middleware's activity touch checks for an open request on the user and cancels it, emailing every witness "request cancelled" (decision 8). Audit.
- Recipient release by quorum: `GET /for-me` returns the k vote shares per rule; the client combines them (section 2) and unwraps.

## 5. Client

- Settings › Witnesses (C1): the set with status, threshold selector within bounds, add by email with fingerprint shown, remove; the verbatim line in a `OneFact` before saving; the witness-also-recipient warning (decision 6).
- Witness invitation (C2) at `/witness/:id`: `OneFact` with accept and decline.
- Rule form as a sheet from a file or folder row (C3): recipients by email with fingerprint chips and the key-changed callout, period select; confirmation in `OneFact` with the computed date; the client does all wrapping and splitting before the single `POST`.
- Rules (C4): banner on a covered folder, marker on rows, list on the dashboard with next check-in; revoke through `OneFact`.
- Recipient notice (C5) from the email link and on the dashboard.
- Witness dashboard section "You are a witness for" (C6) with one card per owner, open request, vote through two `OneFact` screens.
- Release notices (C7) on the dashboard as one-line entries.
- Coverage repair at unlock: fetch `coverageGaps` and stale shares, wrap and PUT silently, with a toast only on failure.

## 6. Emails

From `docs/design/output/emails.md`: witness invitation; recipient notice; reminders at 75, 90, 95 with a check-in link; released by timer (owner and recipients); request opened; vote added; request cancelled; release completed. Never an item name.

## 7. Tests

- Client: `shamir.ts` as in section 2; `handoff.service.ts` round trips: owner creates, witness re-wraps, recipient combines with k of n and fails with k-1; stale-share repair produces shares that combine.
- Server, per slice: invite/accept/decline/remove and threshold bounds; cannot witness yourself; rule creation rejects missing items or shares; timer job transitions at 75/90/95/100 with a faked clock (`jest.useFakeTimers` plus an injectable `now`); check-in resets; revoke deletes blobs; quorum completes at k and not at k-1; owner activity cancels an open request and emails witnesses; recipient endpoints return nothing before release.
- End-to-end (Node, real crypto): three accounts (owner, witness, recipient) plus two more witnesses; owner sets 2 of 3, creates a rule on a folder with two files; timer path with the job's `now` injected through a test-only endpoint `POST /api/_test/clock`; quorum path with two votes; recipient downloads both files byte for byte; third witness's vote after completion is rejected.

## 8. Decisions recorded here

- The owner keeps the release key wrapped under their master key so witness changes and coverage repairs never need the witnesses.
- Shares are regenerated, not patched, when the witness set changes; old shares are useless because the release key is re-split, not rotated, and a removed witness's old share alone is below threshold by construction (threshold is never 1).
- The server trusts its own clock for the timer, which is attacker-1 territory per the product spec.
- A released rule cannot be re-armed (decision 11).
