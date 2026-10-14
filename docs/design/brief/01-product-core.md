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
