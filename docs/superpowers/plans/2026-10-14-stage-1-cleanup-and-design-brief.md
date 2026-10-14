# Stage 1: Repo Cleanup and Design Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead generated server code, make CI build and smoke-test the Docker stack, and write the brief that the owner hands to Claude Design.

**Architecture:** Three independent deliverables on one branch, each its own commit and each verifiable alone: a deletion verified by typecheck, tests and a reference grep; a fourth CI job that builds the images and hits the health endpoint; a set of Markdown files under `docs/design/brief/` written for a designer with no access to this conversation.

**Tech Stack:** TypeScript, Node 22, Jest, Vitest, Docker Compose, GitHub Actions, Markdown.

**Spec:** `docs/superpowers/specs/2026-10-14-product-core-design.md` (stage 1 of section 12; section 11 step 1).

## Global Constraints

- Work on branch `chore/stage-1-cleanup-and-brief`, never on `main`; land by pull request with a merge commit (`CLAUDE.md`, Git).
- Every session that changes anything appends to `_PROJECT_JOURNAL.md` and refreshes its snapshot sections (`CLAUDE.md`).
- The server never receives plaintext names, content or keys; nothing in this stage touches crypto or the API contract.
- Keep the `minio` npm package: the live S3 driver `server/src/storage/s3.ts` imports it.
- Delete only `server/tests/setup.ts`; `server/tests/helpers/setup.ts` is live (`jest.config` `setupFilesAfterEnv`).
- Keep `server/src/middleware/{auth,error,rateLimit,validate}.ts`; only the `*.middleware.ts` files and `index.ts` are dead.
- CI must never print the generated secrets.
- The design brief may not change any sentence listed under "Exact facts" in `03-screens-and-flows.md`; it may only present them.

## Review Focus

1. A live file importing something that was deleted. Expected: typecheck fails loudly before merge, so Task 1 greps for every deleted path and runs typecheck for both tsconfigs.
2. The `tests` directory partially deleted so that jest finds no suites. Expected: `npm test` still reports 43 passing, which Task 1 asserts.
3. The Docker smoke job passing while the API is unhealthy because `compose up` returned early. Expected: the job waits for health and curls through nginx; Task 2 uses `--wait` and asserts on the health body.
4. The smoke job leaking `.env` into logs on failure. Expected: logs are printed only from `docker compose logs`, which never echoes environment values; Task 2 forbids `cat .env` and `env`.
5. Claude Design treating the brief's irreversible-screen sentences as copy it may rewrite. Expected: each sentence is marked verbatim and the brief says so in three places; Task 3 includes that marking.

---

### Task 1: Delete the dead generated server sources

**Files:**
- Delete: `server/src/controllers/`, `server/src/routes/`, `server/src/services/`, `server/src/utils/`, `server/src/config/database.ts`, `server/src/config/redis.ts`, `server/src/config/storage.ts`, `server/src/middleware/auth.middleware.ts`, `server/src/middleware/error.middleware.ts`, `server/src/middleware/rateLimit.middleware.ts`, `server/src/middleware/upload.middleware.ts`, `server/src/middleware/validation.middleware.ts`, `server/src/middleware/index.ts`, `server/tests/unit/`, `server/tests/integration/`, `server/tests/setup.ts`, `server/tests/README.md`, `server/TESTS_SUMMARY.md`
- Modify: `server/tsconfig.json:22-35` (exclude list), `server/tsconfig.test.json:9-21` (exclude list), `server/.dockerignore` (last nine lines), `README.md` (section "Repository cleanup still pending"), `CLAUDE.md` (last bullet under "Code conventions that matter here"), `PROJECT_SUMMARY.md` (bullet "Old sources still in the tree")

**Interfaces:**
- Consumes: nothing.
- Produces: a server tree where `src/` contains only `app.ts`, `server.ts`, `routes.ts`, `config/{env,prisma}.ts`, `lib/`, `middleware/{auth,error,rateLimit,validate}.ts`, `modules/`, `storage/`, `jobs/` (whatever else is there today and not in the delete list stays).

- [ ] **Step 1: Record the baseline**

Run:
```bash
cd server && npm run typecheck && npm test 2>&1 | grep -E "Tests:|Suites:"
```
Expected: `Test Suites: 7 passed, 7 total` and `Tests: 43 passed, 43 total`. If not, stop; the tree is not in the state this plan assumes.

- [ ] **Step 2: Delete the files**

Run from the repo root:
```bash
git rm -r -q server/src/controllers server/src/routes server/src/services server/src/utils \
  server/src/config/database.ts server/src/config/redis.ts server/src/config/storage.ts \
  server/src/middleware/auth.middleware.ts server/src/middleware/error.middleware.ts \
  server/src/middleware/rateLimit.middleware.ts server/src/middleware/upload.middleware.ts \
  server/src/middleware/validation.middleware.ts server/src/middleware/index.ts \
  server/tests/unit server/tests/integration server/tests/setup.ts server/tests/README.md \
  server/TESTS_SUMMARY.md
ls server/src/middleware
```
Expected: `auth.ts error.ts rateLimit.ts validate.ts`.

- [ ] **Step 3: Drop the exclude entries**

In `server/tsconfig.json` replace the whole `"exclude"` array with:
```json
  "exclude": ["node_modules", "dist", "tests"]
```
In `server/tsconfig.test.json` replace the whole `"exclude"` array with:
```json
  "exclude": ["node_modules", "dist"]
```
In `server/.dockerignore` delete the nine lines from `src/controllers` to `src/middleware/index.ts` so the file ends with `*.log`.

- [ ] **Step 4: Grep for survivors**

Run from the repo root:
```bash
git grep -n -E "src/(controllers|routes|services|utils)\b|config/(database|redis|storage)\b|\.middleware'|middleware/index|tests/(unit|integration)\b|TESTS_SUMMARY" -- ':!_PROJECT_JOURNAL.md' ':!project_standards' ':!docs/superpowers'
```
Expected: three hits only, all documentation: `README.md` (cleanup section), `CLAUDE.md` (dead-sources bullet), `PROJECT_SUMMARY.md` (old-sources bullet). Any hit under `server/` or `.github/` is a live reference and must be fixed before continuing.

- [ ] **Step 5: Update the three documents**

`README.md`: delete the entire section from the line `## Repository cleanup still pending` up to, not including, `## License`.

`CLAUDE.md`: delete the bullet that begins `- The old generated sources under`.

`PROJECT_SUMMARY.md`: delete the bullet that begins `- **Old sources still in the tree.**`.

- [ ] **Step 6: Verify**

Run:
```bash
cd server && npm run typecheck && npm test 2>&1 | grep -E "Tests:|Suites:" && cd ../client && npm run type-check && npm test 2>&1 | grep -E "Tests |Test Files"
```
Expected: server `7 passed`, `43 passed`; client `1 passed`, `10 passed`. Then rerun the Step 4 grep; expected: no output.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Delete the generated server sources that the rebuild replaced

They had been excluded from the build, the tests and the image since
2026-10-12 and nothing live imported them. Removing them also removes
the exclude lists that hid them and the stale test documentation that
described the mocked suite which never ran."
```

---

### Task 2: Build and smoke-test the Docker stack in CI

**Files:**
- Modify: `.github/workflows/ci.yml` (append a job after the `e2e` job)
- Modify: `CLAUDE.md` Git section (the phrase "the three CI jobs")
- Modify: `docs/superpowers/specs/2026-10-14-product-core-design.md` is **not** modified; the spec's stage 1 is satisfied by this task.

**Interfaces:**
- Consumes: `.env.example` with `JWT_SECRET=` and `POSTGRES_PASSWORD=` lines; `docker-compose.yml` health checks on `postgres`, `api`, `web`; `/api/health` returning `{"status":"ok",...}`.
- Produces: a check named exactly `Docker (build + smoke)` that branch protection will require.

- [ ] **Step 1: Confirm the smoke sequence works locally**

Run from the repo root:
```bash
cp .env.example /tmp/ci-env-test && perl -pi -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 24)|" /tmp/ci-env-test && docker compose --env-file /tmp/ci-env-test up -d --build --wait --wait-timeout 180 && curl -fsS http://localhost:3000/api/health | grep -q '"status":"ok"' && echo SMOKE_OK; docker compose --env-file /tmp/ci-env-test down -v; rm /tmp/ci-env-test
```
Expected: `SMOKE_OK` printed before the stack is torn down. (`--env-file` keeps the developer's own `.env` untouched.)

- [ ] **Step 2: Add the job**

Append to `.github/workflows/ci.yml`, at the same indentation as the other jobs:
```yaml
  docker:
    name: Docker (build + smoke)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - name: Create .env with throwaway secrets
        run: |
          cp .env.example .env
          perl -pi -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 48)|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 24)|" .env
      - name: Build and start the stack, wait for health
        run: docker compose up -d --build --wait --wait-timeout 180
      - name: Health through nginx
        run: |
          body="$(curl -fsS http://localhost:3000/api/health)"
          echo "$body"
          echo "$body" | grep -q '"status":"ok"'
          echo "$body" | grep -q '"storage":"local"'
      - name: Logs on failure
        if: failure()
        run: docker compose logs --no-color --tail 200
      - name: Tear down
        if: always()
        run: docker compose down -v
```
Do not add any step that prints `.env` or the environment.

- [ ] **Step 3: Validate the workflow file**

Run:
```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs']))"
```
Expected: `['client', 'docker', 'e2e', 'server']`. (If `yaml` is missing: `pip3 install pyyaml`.)

- [ ] **Step 4: Update the job count in CLAUDE.md**

In `CLAUDE.md`, Git section, change `it is protected and requires the three CI jobs to pass before a merge` to `it is protected and requires the four CI jobs to pass before a merge`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml CLAUDE.md
git commit -m "CI: build the Docker images and smoke the stack

The image had never been built before 2026-10-14 and failed four ways
on first run. This job builds both images, waits for every container
to report healthy and reads /api/health through nginx, with throwaway
secrets generated in the job and never printed."
```

- [ ] **Step 6: After the pull request is open, add the check to branch protection**

Run once, from a machine with `gh` authenticated (this is a GitHub setting, not a file):
```bash
gh api -X PATCH repos/joemc3/CrypticStorage/branches/main/protection/required_status_checks \
  -f strict=true \
  -f 'contexts[]=Server (typecheck + tests)' \
  -f 'contexts[]=Client (typecheck + unit tests + build)' \
  -f 'contexts[]=End-to-end (real API + real client crypto)' \
  -f 'contexts[]=Docker (build + smoke)' \
  --jq '.contexts'
```
Expected: four names printed. Do this only after the job has run green once on the pull request, or the PR cannot merge.

---

### Task 3: Write the design brief for Claude Design

**Files:**
- Create: `docs/design/brief/README.md`
- Create: `docs/design/brief/01-product-core.md`
- Create: `docs/design/brief/02-principles.md`
- Create: `docs/design/brief/03-screens-and-flows.md`
- Create: `docs/design/brief/04-constraints.md`
- Create: `docs/design/brief/05-current-ui.md`
- Create: `docs/design/output/.gitkeep`
- Create: `docs/design/decisions.md`

**Interfaces:**
- Consumes: the spec sections 3, 5, 7, 8, 9; the client inventory under `client/src/{pages,components,layouts}`; `client/src/App.tsx` routes.
- Produces: a folder the owner points Claude Design at, and an empty `output/` folder it writes into, and a decisions log the reconciliation step fills.

- [ ] **Step 1: Create `docs/design/brief/README.md`**

```markdown
# Design brief for CrypticStorage

This folder is the complete input for a design session in Claude Design. Read the five numbered files in order. They are the only source of truth; do not rely on the current UI in `client/` for anything but inventory.

What we want back, placed in `../output/`:

1. A design system: palette for light and dark, type scale and fonts, spacing, radius, and the component set in `04-constraints.md`.
2. Screens for every item in `03-screens-and-flows.md`, at phone width and desktop width.
3. For each screen, one paragraph on why it looks the way it does.

What the design may not do is in `04-constraints.md`. Sentences marked **verbatim** in `03-screens-and-flows.md` must appear exactly as written; everything around them is yours.

The output is a proposal. It will be reviewed against the product spec screen by screen, and the decisions recorded in `../decisions.md`, before anything is built.
```

- [ ] **Step 2: Create `docs/design/brief/01-product-core.md`**

```markdown
# What CrypticStorage is

A safe, not a drive. It holds a small number of things that are catastrophic to lose control of: wallet seeds, recovery codes, legal and financial documents, the password to the password manager. Everything in it is encrypted in the browser with keys the server never sees. There is no way to get the contents back without the password, and the product says so plainly instead of apologising for it.

It is open source, self-hostable, and also run as a hosted service by its owner.

## The five promises

1. The server holds nothing it can read. A database dump, a stolen disk, a root shell on the host yields ciphertext.
2. Sharing with another account needs no second secret. Pick a user; they open it with their own login.
3. Links for people outside the platform exist but are second class: the key rides in the URL, with optional password, expiry and download cap.
4. Any item can carry a handoff rule: who receives it, and what releases it. A dead-man timer the owner resets by being active, or a quorum of named witnesses who agree it is time. Different items can go to different people.
5. No recovery, by design. Forget the password and the contents are gone. The handoff rule is the only way anyone else ever reads an item, and only on the owner's terms.

## Who uses it

1. People who run it themselves for their own and their family's secrets.
2. Reviewers and developers reading a zero-knowledge design.
3. Customers of the hosted service.

## The people in a handoff

- **Owner**: holds the items, sets witnesses once, creates rules per item.
- **Recipient**: named on a rule; receives the item when it releases. Knows a rule exists for them, not what it covers.
- **Witness**: named once per account, accepts a duty; any k of n witnesses can release everything the owner marked, early. Witnesses cannot read anything unless they are also recipients.

## Tone

Calm, exact, unhurried. This product asks people to accept permanent consequences. It earns that by never hiding one, never softening one, and never making anyone read a wall of text to find one.
```

- [ ] **Step 3: Create `docs/design/brief/02-principles.md`**

```markdown
# Principles

## 1. One irreversible fact per screen

Every irreversible act is presented one fact at a time: a bold line at the top, at most two short sentences under it, one action to continue. Signup, naming witnesses, accepting a witness duty, creating a handoff rule, voting to release, deleting the account. No scrolling consent, no checkbox lists, no "I agree to the terms". A person who reads only the bold line knows what they are about to do.

## 2. The safe is closed by default

The vault locks after five minutes idle and on tab close. The locked screen is a normal state the user sees often, not an error. Unlocking takes the password and nothing else, and works offline.

## 3. Nothing pretends to be recoverable

There is no "forgot password" link anywhere. The login screen does not offer one. Where other products would put it, this one says, once, in small text, that there is none.

## 4. Status is always visible

A handoff rule has a state and a next date. A witness request has who has voted. A share has an expiry and a download count. These are shown where the item is, not in a separate log.

## 5. Dense where it must be, empty where it can be

A safe holds a few items. The files view should not look like a cloud drive with thousands of thumbnails. Lists over grids; names over icons; whitespace is fine.

## 6. Both themes, equal care

Light and dark are both first-class. Every color is a token with a value in each theme.
```

- [ ] **Step 4: Create `docs/design/brief/03-screens-and-flows.md`**

```markdown
# Screens and flows

Sentences marked **verbatim** must appear exactly as written. Everything else, including headings, buttons and order of secondary content, is open to design.

## A. Public

### A1. Landing (`/`)
What it is, the five promises in one screen, sign in and create account. No feature grid, no testimonials.

### A2. Create account: the contract (`/register`, four screens before any form)
Each screen: one bold line, at most two sentences, one button to continue, a quiet way back.

1. **verbatim:** There is no password reset.
   Supporting: If you forget your password, nothing and nobody can get your items back. Not us, not support, not a recovery key.
2. **verbatim:** Your email address cannot be changed later.
   Supporting: Your email is part of how your keys are derived. Choose the one you will still have in ten years.
3. **verbatim:** Your witnesses can release your items without you.
   Supporting: You will choose them later. Any k of n of them, together, can hand your items to the people you name. Choose people you would trust with a key to your house.
4. Confirmation. **verbatim:** Type "I understand there is no way back" to continue.
   A single text field; the button enables only when the phrase matches.

Then the form: email, password, password again, with a strength indicator that explains itself in one line. Then "check your email" with the address shown and a resend action.

### A3. Verify email (`/verify/:token`)
One line of success, one button to sign in. Or one line of failure with resend.

### A4. Sign in (`/login`)
Email and password. No "forgot password" link; in its place, small text: **verbatim:** There is no password reset. If two-factor is on, a second screen for the six-digit code with a link to use a backup code.

### A5. Shared link (`/s/:token`)
The file name once decrypted, its size, a download button. If the link has a password, ask for it first. If expired, revoked or exhausted, say which in one line. The recipient has no account; keep it to one screen.

### A6. Not found (`/404`)

## B. Inside the vault

### B1. Locked (`/unlock`, shown after idle or reload)
The account email, a password field, unlock. Small text: locks after five minutes idle. Sign out as a secondary action.

### B2. Dashboard (`/dashboard`)
Storage used, number of items, handoff rules with their states and next dates, pending witness invitations or requests, recent activity. This is the status page of the safe.

### B3. Files (`/files`, `/files/:folderId`)
Breadcrumbs, a list of folders and files with name, size, modified, and a marker if a handoff rule or a share applies. Upload by drag-and-drop or button with progress. Row actions: download, preview, share, handoff, move, rename, delete.

### B4. Preview (modal or page)
Text and images only. Everything else is download.

### B5. Share dialog
Two tabs. **With a user**: enter an email; show the user's key fingerprint and whether the owner has marked it verified; share. **With a link**: optional password, expiry (1 hour to 30 days), download cap; the resulting URL with a copy action and a warning that anyone with the URL can open it.

### B6. Shared with me
Items others shared, with who and when. Released handoff items appear here with a marker: **verbatim:** Handed off to you by {name}.

### B7. Settings (`/settings`)
Sections: Profile (email, read-only, with the reason); Change password; Key fingerprint; Two-factor authentication; Witnesses (see C); Storage; Delete account (see D).

## C. Handoff

### C1. Witnesses (in Settings)
The current set with acceptance status and the threshold. Add by email; set k of n within the bounds 2 to 7 and 2 to n. Before saving a change: **verbatim:** Any {k} of these {n} people, together, can release everything you have marked for handoff.

### C2. Witness invitation (the invited person's side)
A screen the invitee reaches from an email. **verbatim:** {name} is asking you to be a witness. Supporting: Together with others they name, you could release their items to the people they chose. You will never be able to read those items yourself unless you are also a recipient. Accept or decline.

### C3. Create a rule (from a file or folder)
Recipients by email (must have accounts); period: 30 days, 90 days, 1 year, 5 years, 10 years, custom. One confirmation screen: **verbatim:** On {date}, or sooner if your witnesses agree, {recipients} will receive {item}. Supporting: You will be reminded before then. Signing in resets the clock. Create.

### C4. Rules list (in Dashboard and on each item)
State: active, warning, released by timer, released by quorum, revoked. Next check-in date. Revoke action with one confirmation: **verbatim:** {recipients} will no longer receive {item}.

### C5. Recipient notice (the recipient's side)
From an email or the dashboard: **verbatim:** {name} has set something aside for you. Supporting: You will receive it on their terms. There is nothing to do now.

### C6. Request a release (witness side)
From the dashboard: the owner, the witness set, who has voted. Open a request: **verbatim:** You are asking to release {name}'s items now. Supporting: {name} and the other witnesses will be told. If {name} signs in, the request is cancelled. Then, for each further witness: **verbatim:** Add your vote to release {name}'s items. Supporting: Once {k} votes are in, the items go to the people {name} chose. This cannot be undone.

### C7. Release notice (owner side, email and dashboard)
A request was opened; a vote was added; a rule released. Each in one line with who and when.

## D. Delete account (in Settings)
One confirmation screen. **verbatim:** Everything in this safe is destroyed. Supporting: Files, rules, shares and witness settings. Items already released to others stay with them. Type the account email to continue.

## E. Admin (self-hosted only, `/admin`)
Users: email, verified, storage used and quota, created. Create a user by email (they set the password themselves). Set a quota. Nothing here can show an item or a name.

## F. Emails (templates, text only)
Verify your email. Reminder at 75 %, at 90 %, final warning. Rule released by timer. Witness invitation. Release request opened, vote added, release completed. Recipient notice. Each one: subject line, two sentences, one link.
```

- [ ] **Step 5: Create `docs/design/brief/04-constraints.md`**

```markdown
# Constraints

## What the design may not decide

- Nothing that removes or softens a promise in `01-product-core.md`.
- No recovery flow of any kind: no "forgot password", no recovery key, no security questions, no "contact support".
- No change to the lock behaviour: five minutes idle, lock on tab close.
- No screen that asks the server for something it cannot know: no previews generated server-side, no search over names, no thumbnails.
- No change to the **verbatim** sentences in `03-screens-and-flows.md`. Present them; do not rewrite them.
- No consent walls, scrolling terms, or checkbox lists in place of the one-fact-per-screen pattern.
- No new data shown to the server. Every label on screen is either decrypted in the browser or already known to the server (sizes, dates, states, emails).

## Technical

- React 18, TypeScript, Vite, Tailwind CSS 3, Headless UI, Heroicons, Framer Motion for small transitions, react-router 6, zustand.
- Works at phone width (360 px) and desktop. No horizontal scroll.
- Light and dark via CSS tokens on `:root`; `prefers-color-scheme` honoured; a manual override allowed.
- Fonts from Google Fonts or system; at most one display face and one text face plus a monospace for fingerprints and codes.
- Accessible: 4.5:1 contrast for text, visible focus, every control reachable by keyboard, every icon with a label.

## Component set to design

Button (primary, secondary, danger, quiet), Input (text, password with reveal, code), Card, Modal, Toast, ProgressBar, Spinner, Breadcrumbs, List row (file, folder, rule, witness), State badge, Fingerprint (monospace, grouped), the one-fact screen (bold line, supporting text, one action, quiet back), Empty state, Table (admin).
```

- [ ] **Step 6: Create `docs/design/brief/05-current-ui.md`**

```markdown
# The current UI, for inventory only

The client today is a generic Tailwind look: indigo gradient landing, white cards, gray text, `primary` sky-blue and `dark` slate palettes in `client/tailwind.config.js`, CSS variables in `client/src/index.css`. None of it should be kept for its own sake.

Routes that exist: `/`, `/login`, `/register`, `/s/:token`, `/dashboard`, `/files`, `/files/:folderId`, `/settings`, `/404`.

Pages: Home, Login (with a two-factor step), Register, Dashboard (QuickStats, RecentFiles, StorageChart), Files (FileList, FileItem, FileUpload with progress, FilePreview, ShareDialog), Settings (Profile, Change password, Master key fingerprint, Two-factor authentication, Storage), Shared (public link page), NotFound.

Layouts: AuthLayout, DashboardLayout (sidebar navigation), PublicLayout.

Common components: Button, Card, Input, Modal, ProgressBar, Spinner, Toast.

What does not exist yet and is new in `03-screens-and-flows.md`: the signup contract screens, email verification, the locked screen as a designed state (a plain form exists), witnesses, handoff rules, recipient and witness flows, admin, delete account confirmation, all email templates.
```

- [ ] **Step 7: Create the output folder and the decisions log**

```bash
touch docs/design/output/.gitkeep
```

`docs/design/decisions.md`:
```markdown
# Design decisions

Filled during reconciliation of `output/` against `docs/superpowers/specs/2026-10-14-product-core-design.md`. One row per screen or component. Verdicts: **adopt**, **adopt with change**, **reject**, **defer**.

| Date | Screen or component | Verdict | What changes and why |
|---|---|---|---|
```

- [ ] **Step 8: Verify the brief against the spec**

Run from the repo root:
```bash
grep -c "verbatim" docs/design/brief/03-screens-and-flows.md
grep -n "forgot\|recovery key\|reset" docs/design/brief/*.md | grep -v -i "no \|none\|not \|never\|cannot\|There is no"
```
Expected: the first prints at least 14; the second prints nothing (every mention of recovery is a negation).

- [ ] **Step 9: Commit**

```bash
git add docs/design
git commit -m "Design brief for the Claude Design session

Everything a designer needs without this repository's history: the
product core, the one-fact-per-screen principle, every screen and flow
with the sentences that must appear verbatim, what the design may not
decide, and an inventory of the current UI. Output goes to
docs/design/output and is reconciled into docs/design/decisions.md
before anything is built."
```

---

### Task 4: Journal, pull request, handoff note

**Files:**
- Modify: `_PROJECT_JOURNAL.md` (snapshot sections and a new session log entry)

- [ ] **Step 1: Update the journal**

In `## Current state`, replace the `| Ops |` row's text with: `Docker Compose (Postgres + API on a volume + nginx web), GitHub Actions with four jobs including a Docker build and smoke, no-Docker path on embedded Postgres`. In `## Next steps`, tick `Delete the old generated server sources` and `Add docker compose build ... to CI`, and add `- [ ] Owner runs the Claude Design session against docs/design/brief/ and places the output under docs/design/output/.` Add a session log entry at the top of `## Session log` with the heading `YYYY-MM-DD · local (Claude Code) · stage 1: dead sources deleted, Docker smoke in CI, design brief written`, stating what was deleted (file counts), the new job name, the brief's file list, and the verification results from Tasks 1 to 3.

- [ ] **Step 2: Commit and open the pull request**

```bash
git add _PROJECT_JOURNAL.md
git commit -m "Journal: stage 1"
git push -u origin chore/stage-1-cleanup-and-brief
gh pr create --base main --title "Stage 1: delete dead sources, Docker smoke in CI, design brief" --body "Implements stage 1 of docs/superpowers/specs/2026-10-14-product-core-design.md per docs/superpowers/plans/2026-10-14-stage-1-cleanup-and-design-brief.md. Three commits, one per task. After the Docker job runs green once, add it to branch protection (plan Task 2 step 6)."
```

- [ ] **Step 3: After CI is green, add the Docker check to protection** (Task 2 step 6), then hand the pull request to the owner to merge.

- [ ] **Step 4: Tell the owner how to start the design session**

In the final message: point Claude Design at the folder `~/tmp/CrypticStorage/docs/design/brief/`, ask it to read `README.md` first, and have it save everything it produces under `~/tmp/CrypticStorage/docs/design/output/`. When that is done, the next session here runs the reconciliation (spec section 11 step 3).
