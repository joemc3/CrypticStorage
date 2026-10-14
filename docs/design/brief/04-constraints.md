# Constraints

## What the design may not decide

- Nothing that removes or softens a promise in `01-product-core.md`.
- No recovery flow of any kind: no "forgot password", no recovery key, no security questions, no "contact support".
- No change to the lock behaviour: five minutes idle by default, selectable 1 to 30 in Settings, lock on tab close.
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
