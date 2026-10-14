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
