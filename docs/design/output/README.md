# CrypticStorage design proposal

Produced 2026-10-14 against `docs/design/brief/`. A proposal, not the source of truth: it is reconciled screen by screen against `docs/superpowers/specs/2026-10-14-product-core-design.md` and the outcome goes in `../decisions.md`.

## What is here

| File | What it is |
|---|---|
| `design-system.md` | Palette (light and dark), type, spacing, radius, motion, and the component set from `04-constraints.md`, with Tailwind notes |
| `tokens.css` | The tokens as CSS custom properties on `:root`, ready to drop into `client/src/index.css` |
| `screens.md` | One paragraph per screen on why it looks the way it does, keyed to the brief's section letters |
| `emails.md` | The text of every email template (section F) |
| `open-questions.md` | Places where the brief and the spec disagree, or where the design had to choose. Candidates for `decisions.md` |
| `canvas/` | The mockups themselves: one `.dc.html` per screen group, `canvas.json` (layout) and `cs.css` (the stylesheet every mockup uses). Readable as HTML; the layout and component classes in `cs.css` are a working reference, not production code |

The live canvas is a private Claude Design artifact owned by Joe. Every screen there shows desktop at 1280, phone at 390 in light, and phone at 390 in dark.

## The spine: hold on to these

The implementation is expected to make the design its own. These are the decisions that make it this design rather than another, so keep them even when everything else moves.

1. **The serif means consequence.** Newsreader appears only for sentences a person must not miss: the one-fact screens, the locked state, the landing promise, notices that something has been set aside or released. Every operational surface is Instrument Sans. If a new screen wants a serif, ask whether it states a permanent consequence; if not, it gets the sans.
2. **One component for every irreversible act.** Signup, saving witnesses, accepting a duty, creating or revoking a rule, opening a request, voting, deleting the account: all use the same full-screen one-fact layout. No sidebar, no tabs, a quiet Cancel at top right, one action, a quiet Back. They are screens, not modals, so nothing else competes with the sentence.
3. **Status lives where the item is.** The rule banner sits on the folder it covers; markers sit on file rows; the witness card shows votes; the link page shows expiry and downloads left. There is no separate log to go and find.
4. **Lists, not grids.** A safe holds a few dozen things. Names are the content; icons only say file or folder.
5. **The lock state is always visible.** Desktop sidebar footer says "Unlocked · locks after 5 min idle" with a Lock now button; the phone top bar has the lock button. The locked screen is a normal, calm place.
6. **One accent.** Vault green does primary actions and "active". Amber is only for warning states, blue only for released and shared, red only for destroy and revoke. Each also differs in lightness, so they hold up for colour-blind readers.

## Where you have latitude

Spacing values, exact copy outside the 14 verbatim sentences, how the dashboard column is ordered, how sheets animate, the icon set (the drawings here are placeholders in the Heroicons outline weight; swap in Heroicons wherever one fits), empty states, the settings index on phone, admin layout. If a component in `cs.css` is awkward in React, change it.
