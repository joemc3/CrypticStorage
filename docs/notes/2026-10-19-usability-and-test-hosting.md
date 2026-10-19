# Usability and test hosting: owner notes, 2026-10-19

Written at the end of the first sitting where the owner ran the app themselves (local Docker stack, `make up`). No code changed. These notes are the starting brief for whatever comes next; the owner has more thoughts to add. Do not treat them as a spec.

## The verdict

The owner's words: "It's too texty. People aren't going to read it." The app is "not in a good, usable spot." In order of how they came up:

1. **Too much text.** Screens explain themselves in prose. People will not read it.
2. **It needs motion: animations "and stuff like that".** The ideas have to be shown, not described.
3. **The core concepts don't land.** "People aren't even going to realize what a witness is." k-of-n is shown as text ("2 of 3"), and nobody new to it will get what that means or why it matters.

So the handoff subsystem works (it's proven end to end in CI), but a first-time visitor can't tell what it is or why they'd want it. That makes it the main problem. The API follow-ups in the journal come second.

### Directions to explore (not decided)

- Show each concept on the screen where it first appears: a witness as a person with a key part, k-of-n as parts coming together, the dead-man timer as a clock you reset by checking in.
- Cut the copy hard: one sentence per screen where possible, details behind a "how it works".
- A first-run walk-through that acts out a release: the owner goes quiet, the witnesses confirm, the recipient opens the item.
- Check the vocabulary. "Witness", "handoff", "rule", "quorum" may need plainer words, or at least pictures that stand in for them.
- Go back to the design run (`docs/design/`). It set the visual language. These notes say it isn't enough for the concepts, so the next design pass should be about explaining the concepts, not about styling.

## Blocker found while testing: email verification can't be completed locally

- Signup requires a verified email before sign-in (login answers 403).
- With `MAIL_DRIVER=log`, `server/src/lib/mail.ts` logs only the recipient and the subject, not the body, on purpose, because the body holds a one-time link. The message is kept only in the API's memory, and the one route that reads it back (`/api/_test/mail`) is mounted only under `NODE_ENV=test`. The Docker stack runs `NODE_ENV=production`.
- Result: with the log driver, nobody can verify an email, and witness invite links have the same problem. In this sitting the owner's local account was unblocked by setting `email_verified_at` directly in the local database.
- The owner rejected both quick fixes offered: printing the full email from the log driver, and a switch that turns verification off. This needs rethinking along with how people will test (next section), not patching on its own.

## Goal: a test deployment on one of our VPSs

The owner wants other people to be able to look at it without committing money.

### Supabase: not needed

The owner wasn't sure whether this needs Supabase. **It doesn't.** CrypticStorage is self-contained: Express + Prisma API, its own Postgres, file storage on a local volume (`storage: local`), and its own auth and crypto. It has never used Supabase. The Docker Compose stack (postgres, api, web) is the whole thing. Moving to Supabase would mean rewriting auth and storage. The only argument for it would be avoiding running a database ourselves, and the stack already does that in a container.

### What a VPS test deployment needs

The VPS pattern in the vault (`Areas/VPS-Infrastructure/06-Adding-Removing-Services`) fits: put the containers on the `pangolin` network with no published ports, add a Pangolin resource for a subdomain, and get SSL from Pangolin.

1. **HTTPS is required, not optional.** The client's crypto uses WebCrypto (`crypto.subtle`), which browsers only allow in a secure context. `localhost` counts as one; a plain-HTTP VPS address does not. Pangolin's SSL covers this.
2. **A compose override for the VPS:** join the external `pangolin` network, drop the `web` port mapping, and keep `api` and `postgres` internal.
3. **Email that testers can actually receive or read.** Options to decide between:
   - a mail catcher with a web inbox (for example, Mailpit) behind its own protected subdomain, which is free and needs no domain verification, but testers can't see their own mail unless we share the inbox;
   - a transactional email provider on a free tier, with real delivery, which needs a sending domain with SPF/DKIM;
   - a test-only mode that shows the link in the app, which repeats the switch the owner rejected and so probably isn't it.
   Witness invites and handoff notices make this matter more than for a normal app: the product works by sending email to other people.
4. **The handoff job needs a way to be shown.** The timer runs in real time (days), and the test clock route exists only under `NODE_ENV=test`. A demo needs some way to show a release without waiting a week, or testers will never see the core feature.
5. **"Test data only" framing.** No real secrets until the external security review. The app should say so on screen, and purging test data has to be easy (the session-cleanup rule: list, then delete, using a pattern that can't match a real user).
6. **Secrets and backups:** a root `.env` on the VPS from `.env.example`, generated secrets, and a decision on whether test data is backed up at all (probably not).
7. **Cost check:** an existing VPS plus a free mail option should mean no new spend. Confirm the VPS has room next to whatever else it runs.

## Open questions for the owner

- Which VPS, and which subdomain?
- Who are the first testers, and do they get real email?
- Should the usability rework come before the VPS deployment, or should we deploy as-is to get reactions first?
- Plainer names for "witness" and "handoff"?
