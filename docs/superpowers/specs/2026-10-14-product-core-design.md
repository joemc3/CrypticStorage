# CrypticStorage product core

Date: 2026-10-14. Status: approved in conversation, awaiting written review.
Supersedes `project_standards/PRD.md` and `project_standards/SPECIFICATION.md` (November 2025), which stay in the tree as history.

## 1. What it is

CrypticStorage is a safe, not a drive. It holds a small number of things that are catastrophic to lose control of: wallet seeds, recovery codes, legal and financial documents, the password to the password manager. Everything in it is encrypted in the browser with keys the server never sees. There is no way to get the contents back without the password, and the product says so plainly instead of apologising for it.

It is open source first, reviewed in public, and self-hostable. A hosted service run by the owner is the same code behind a domain.

## 2. Who it is for, in order

1. People who run it themselves for their own secrets and their family's.
2. Reviewers and developers who want to read a zero-knowledge design done carefully.
3. Customers of a hosted service, later, once an external review exists.

## 3. The core, as promises

1. **The server holds nothing it can read.** File contents, file names and folder names are encrypted client-side. A database dump, a storage volume, a root shell on the host, or a backup yields ciphertext.
2. **Sharing with another account needs no second secret.** Pick a user; they open the item with their own login. Every account has a key pair for this.
3. **Links for people outside the platform exist but are second class.** The key rides in the URL fragment; the server gates with password, expiry and download cap but cannot read.
4. **Any item can carry a handoff rule.** Who receives it, and what releases it: a dead-man timer, or a quorum of named witnesses. Different items can go to different people.
5. **No recovery, by design.** No reset, no recovery key, no support path. Loss of the password is loss of the contents. The handoff rule is the only way anyone other than the owner ever reads an item, and only on the owner's terms.

Everything else, folders, quotas, two-factor, audit log, previews, large uploads, supports those promises and is on the plan, but is not the core.

## 4. Threat model

**Defended now (attacker 1):** anyone who obtains the data at rest or in transit. A leaked database, a stolen disk or backup, a hosting provider that looks, an administrator who copies, a passive network observer under TLS. The current design defends this fully.

**Acknowledged, deferred (attacker 2):** someone who controls the server for long enough to change what it serves. Because the server also serves the JavaScript that encrypts, a patient attacker can serve a client that leaks the password at the next login. Closing this needs a client that does not come from the storage server: a reproducible build with published hashes first, a packaged client later. The design must never make this harder: all cryptography stays in one pure client module, and the server never injects configuration, scripts or templates into the client.

**Out of scope:** compromise of the user's device, a malicious client build the user chose to run, traffic analysis of sizes and timing.

**Metadata the server can see:** ciphertext sizes, MIME types, folder tree shape (not names), timestamps, who shares with whom, who is a witness or recipient for whom, rule periods and states, IP addresses and user agents in the audit log.

## 5. Account and vault model

Kept from the 2026-10-12 rebuild, because it already matches the core:

- Password → PBKDF2-SHA256, 600,000 iterations, salt = SHA-256(email), 512 bits out. First half is the wrapping key (device only, non-extractable). SHA-256 of the second half is the auth hash, the only credential the server sees, stored bcrypted.
- Random AES-256 master key per account, wrapped under the wrapping key.
- RSA-OAEP 4096 pair per account. Private key wrapped under the master key; public key in clear. This pair is what makes recipients and witnesses addressable.
- Random AES-256 key per file, wrapped under the master key. Content in 1 MiB AES-GCM chunks, per-chunk nonce, chunk index and count in the authenticated data. File names under the file key; folder names under the master key.
- TOTP with single-use backup codes, 15-minute access tokens bound to a session, rotating refresh tokens, per-IP rate limits, audit log, quotas.

Changed, because this is a safe:

- **Signup is a contract.** Before the account exists the user sees, one fact per screen, that there is no reset, no recovery key, no support path, and that the email cannot be changed. Each fact is a bold line and one action. The last screen requires typing a short phrase. The audit log records the acknowledgement.
- **Email verification is mandatory** at signup. Timers, reminders, witness and recipient invitations all depend on reaching the person.
- **Lock behaviour.** Keys live only in memory while unlocked. Auto-lock after 5 minutes idle by default, configurable down, not up beyond 30. Lock on tab close. Re-entering the password unlocks offline.
- **Public key trust.** Every contact shows a fingerprint. Trust on first use; a changed key is a loud warning, never silent. A "verified in person" marker the owner can set. Out-of-band verification proper belongs to attacker 2 work.

Explicitly out: password reset, recovery key, security questions, support-assisted recovery, email change, deduplication (it reveals that two users hold the same file).

## 6. Sharing

- **User to user:** the owner fetches the recipient's public key, wraps the file key with it, the server stores the wrapped key. Either side can revoke. The recipient reads the file name because names are under the file key.
- **Links:** `https://host/s/<token>#<file key>`. Fragment never reaches the server. Password (bcrypt), expiry, revocation, download cap enforced server-side, counter incremented only when bytes are served.
- **Folders:** sharing a folder shares each file in it; a folder key for sharing is a later refinement, not core.

## 7. Handoff rules

### 7.1 People

- **Witnesses** are set once per account in Settings: accounts on the platform chosen by email, with a threshold k of n (for example 2 of 3). Each witness receives an invitation and must accept; they are taking on a duty. The owner sees who has accepted. Changing the witness set re-splits every rule's release key client-side.
- **Recipients** are set per rule: one or more accounts on the platform. A recipient is told that a rule exists for them, not what it covers, so a wrong email is caught early and the inheritance is not a surprise.
- Non-account heirs are not supported. If ever needed, the path is a link with a password, as a separate feature.

### 7.2 A rule

Created on a file or a folder. Fields: recipients, period (30 days, 90 days, 1 year, 5 years, 10 years, custom), created at, state. Created only after one confirmation screen stating exactly what will happen and when.

States: `active`, `warning` (reminders going out), `released_by_timer`, `released_by_quorum`, `revoked`. All visible in one place with the next check-in date. Every state change is logged and emailed to the owner.

### 7.3 Cryptography

All of this runs in the owner's browser; the server stores opaque blobs.

1. Generate a random 256-bit **release key** for the rule.
2. Wrap the file key of every covered item under the release key. Store these wrapped copies with the rule.
3. Wrap the release key under each recipient's public key (RSA-OAEP). Store.
4. Split the release key into n shares with Shamir's secret sharing, threshold k. Wrap share i under witness i's public key. Store.

Revoking a rule deletes its blobs. The owner's own copies of the file keys are untouched throughout.

### 7.4 Release by timer

- Activity is any authenticated request, or following a check-in link from a reminder email.
- Reminders at 75 % and 90 % of the period, then a final warning; the rule enters `warning` at the first reminder.
- When the period passes with no activity, the server marks the rule `released_by_timer` and lets each recipient fetch their wrapped release key. The server decided when; it never decrypted anything.
- The owner is emailed at every step. Logging in during `warning` resets the clock.

### 7.5 Release by quorum

- Any witness can open a release request for an owner. Every other witness is notified and can contribute or refuse.
- A contributing witness unwraps their share with their own keys and submits it re-wrapped under each recipient's public key. The server forwards blobs it cannot read.
- When k shares are present, the recipient's client combines them, recovers the release key, and unwraps the file keys. The server cannot fake a quorum.
- The owner is emailed when a request opens and at each contribution. If the owner logs in while a request is open, the request is cancelled and the witnesses are told. A quorum cannot run quietly against a living, active owner.

### 7.6 After release

The items appear in the recipient's "shared with me", marked as a handoff and from whom. From there it is the ordinary sharing path. The owner's data is unchanged.

## 8. Irreversibility principle

Every irreversible act is presented one fact at a time, in one sentence, bold at the top, acknowledged with one action before it happens. Signup, the no-email-change rule, accepting a witness duty, creating a handoff rule, contributing to a quorum, deleting the account. No walls of text, no scrolling consent. This is a product principle; the design pass (section 11) applies it.

## 9. Supporting features, kept on the plan

Folders with breadcrumbs; drag-and-drop upload with progress; previews for text and images; dashboard with quota and recent activity; locked-vault screen; links with password, expiry and download cap; quotas; an admin role for self-hosters that can create accounts and set quotas and can read nothing; streaming uploads for large files, later; passkeys, later; encrypted name search, later.

## 10. Shape of the project

- One codebase, three ways to run: self-hosted by Docker Compose; the hosted service, which is the same image behind the owner's domain plus email and later billing; a packaged client, later, for attacker 2. Nothing in the server may depend on which way it runs.
- Email becomes a required service from stage 2 onward. Self-hosters bring SMTP; the hosted service uses a provider.
- `SECURITY.md` is the document reviewers read. It grows a section for the handoff scheme as that lands.
- A reproducible client build with published hashes is the cheap first step toward attacker 2 and is done early.

## 11. Design handoff

The visual and interaction design is produced in Claude Design in a separate session run by the owner, and reconciled here. Its output is a proposal, never the source of truth.

1. **Brief out (this repo).** `docs/design/brief/` holds a brief written for Claude Design: the core promises, the irreversibility principle, an inventory of screens and flows with the exact facts each irreversible screen must state, the existing UI inventory, technical constraints (React, Tailwind, the component set), and a list of what the design may not decide: nothing that removes a core promise, no recovery flows, no softening of the lock behaviour, no new server-visible data.
2. **Design runs (owner, separate session).** Output lands under `docs/design/output/` in whatever form it takes: mockups, tokens, a design system.
3. **Reconcile (this repo, in conversation).** A per-screen comparison of the output against this spec: right, contradicts the core, misses a nuance, adds something never asked for. Each decision is recorded in `docs/design/decisions.md`. Only the reconciled design feeds the implementation plan.

## 12. Order of work

1. Repo cleanup: delete the dead generated sources; build the Docker images in CI.
2. Signup as a contract, mandatory email verification, auto-lock. Email service enters the stack.
3. Witnesses: invitations, acceptance, Shamir split, fingerprints and trust on first use.
4. Handoff rules with the timer, reminders and check-ins.
5. Quorum release.
6. Admin role and quotas for self-hosters.
7. Design handoff (section 11) and the design pass over the whole UI.
8. Reproducible client build with published hashes.
9. External security review, then the hosted service.
10. Streaming uploads, passkeys, packaged client, in whatever order matters then.

Each stage gets its own spec and plan under `docs/superpowers/`; this document is the frame they are checked against.

## 13. Dropped from the 2025 PRD, and staying dropped

Security-question recovery, recovery keys, deduplication, storage analytics dashboard, blockchain integrity, IPFS, real-time collaboration, thumbnails as a priority, 1000-concurrent-user targets, HIPAA and SOC 2 claims. None of them serve a safe.

## 14. Open questions

- Whether a witness should also be allowed to be a recipient. Default: allowed, with a warning that they then hold both a share and the destination.
- Minimum and maximum witness set sizes. Default: n between 2 and 7, k between 2 and n.
- Whether the hosted service needs a legal review of acting as timekeeper for inheritance. Not a design question; noted so it is not forgotten.
