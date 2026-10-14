# Design decisions

Filled during reconciliation of `output/` against `docs/superpowers/specs/2026-10-14-product-core-design.md`. One row per screen or component. Verdicts: **adopt**, **adopt with change**, **reject**, **defer**. Rows 1 to 12 answer `output/open-questions.md` in order; the owner decided 1, 2, 3, 5 and 11 in conversation on 2026-10-14 and delegated the rest.

| Date | Screen or component | Verdict | What changes and why |
|---|---|---|---|
| 2026-10-14 | 1. `{name}` as email everywhere | adopt with change | Add an optional display name per account, server-visible, not secret, set at signup or in Settings, falling back to the email. Spec section 5 amended. The design already works both ways. |
| 2026-10-14 | 2. "Lock after" selector in Settings | adopt | The spec wins over the brief: default 5 minutes, selectable 1 to 30. The brief's constraint was over-tight and is corrected. |
| 2026-10-14 | 3. Theme override under "Lock and look" in Settings | adopt | System / Light / Dark. The brief omitted a home for it; this one is right. |
| 2026-10-14 | 4. Irreversible confirmations as full screens, not modals | adopt | Every irreversible act leaves the app chrome for the one-fact layout, including rule create and revoke; the rule form itself stays a sheet. Nothing competes with the sentence. |
| 2026-10-14 | 5. Folder rule shown once as a banner on the folder | adopt | Child rows do not repeat the marker; the folder's row in its parent carries it. |
| 2026-10-14 | 6. Witness-also-recipient warning | adopt | Shown on the Witnesses page and in the rule form at the moment the overlap is created. Matches spec 7.1. |
| 2026-10-14 | 7. "Key changed" warning | adopt | Red callout above Share in the share dialog, and on any recipient chip in the rule form. Never silent (spec section 5). |
| 2026-10-14 | 8. Two extra emails | adopt | Recipient's copy of "released by timer" and "request cancelled" to witnesses. Both follow from spec 7.4 and 7.5; spec amended to list them. |
| 2026-10-14 | 9. Emails never name items | adopt, recorded as a rule | Follows from promise 1: the server cannot read names, so no email can carry one. Emails say "what the rule covers". Spec section 7.4 amended. |
| 2026-10-14 | 10. "You are a witness for" dashboard section | adopt | One card per owner with votes shown; the entry point for C6. |
| 2026-10-14 | 11. Re-arming a released rule | reject | A released rule stays released as a record. The owner creates a new rule. Spec 7.6 amended. |
| 2026-10-14 | 12. `[HOSTED DOMAIN]` placeholder on landing | defer | Filled when the hosted service has a domain (spec stage 9). |
| 2026-10-14 | Design system, tokens, type (Newsreader for consequence, Instrument Sans operational, IBM Plex Mono for codes), one green accent | adopt | The six "spine" decisions in `output/README.md` are binding on implementation; everything under "latitude" is not. |
| 2026-10-14 | All 24 artboards | adopt | Every screen in brief sections A to F is present at 1280 desktop and 390 phone in light and dark, every verbatim sentence intact, no recovery flow anywhere. Implementation follows them screen by screen, deviating only where a later row here says so. |
