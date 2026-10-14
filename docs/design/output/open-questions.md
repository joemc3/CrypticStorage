# Open questions for reconciliation

Places where the design had to choose, or where the brief and the spec pull in different directions. Each is a candidate row for `../decisions.md`.

1. **{name} is an email address.** Accounts have no display name, so every verbatim sentence with {name} renders an email ("r.okafor@gmail.com's items"). It is correct and server-known, but the possessive reads badly and long addresses wrap on phone. Option: an optional display name per account (server-visible, not secret), falling back to the email. The design works either way.
2. **Auto-lock time.** The brief's constraints say "no change to the lock behaviour: five minutes idle"; spec section 5 says the default is 5 and it is configurable from 1 to 30. Settings shows a "Lock after" select at 5 minutes. Drop the select if the brief wins.
3. **Theme override location.** The constraints allow a manual override; the brief's Settings sections do not list one. It sits in Settings under "Lock and look" with System / Light / Dark.
4. **Irreversible confirmations are full screens, not modals.** Witness save, rule create, rule revoke, request, vote and delete all leave the app chrome for the one-fact layout. The rule form itself is a sheet; only its confirmation takes the screen.
5. **Folder rules shown once, not on every child row.** A rule on a folder is a banner at the top of that folder; child rows do not repeat the marker. The folder's own row in its parent carries the Handoff marker.
6. **Witness who is also a recipient.** The warning (spec 7.1) is placed on the Witnesses page and should also appear in the rule form when the overlap is created there.
7. **Key changed.** Spec 5's loud warning is designed as a red callout above the Share button in the share dialog. It also needs a home on any recipient chip in the rule form.
8. **Two extra emails.** A recipient copy of "released by timer", and "request cancelled" to witnesses. The brief's list does not have them; the spec implies both.
9. **Emails never name items.** Follows from promise 1 and is applied throughout `emails.md`. Worth recording so nobody adds a name later.
10. **Witness side of the dashboard.** "You are a witness for" is a dashboard section with one card per owner. Brief C6 says "from the dashboard" without a layout; this is the proposal.
11. **Released-by-timer while the owner was away.** The owner's rules list shows it as a normal state on return. The spec does not say whether a released rule can be re-armed; the design offers nothing beyond "Add another rule".
12. **Hosted domain on the landing page** is a placeholder `[HOSTED DOMAIN]`.
