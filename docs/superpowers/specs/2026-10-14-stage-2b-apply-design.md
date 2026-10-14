# Stage 2b: apply the design to the existing screens

Date: 2026-10-14. Implements decision rows 13 and 14 of `docs/design/decisions.md`. Runs after or alongside stage 2; it has no server work and no new behaviour.

## 1. Outcome

Every screen that exists today looks like its artboard in `docs/design/output/canvas/`, using the tokens, type and components from `docs/design/output/design-system.md`. Behaviour and the API contract do not change.

## 2. Scope, by artboard

| Artboard | Screen | Notes |
|---|---|---|
| A1 Landing | `HomePage` | the five promises; no feature grid |
| A4 Sign in | `LoginPage`, `LoginForm`, two-factor step | no forgot link |
| A5 Shared link | `SharedPage` | password, expiry, exhausted states in one line each |
| A3/A6 | `NotFoundPage`, and the new `VerifyPage` from stage 2 | |
| B1 Locked | `UnlockForm` | stage 2 adds the timer; this stage draws it |
| B2 Dashboard | `DashboardPage`, `QuickStats`, `RecentFiles`, `StorageChart` | rules and witness sections appear in the handoff stage; leave their slots empty, not placeholders |
| B3 Files | `FilesPage`, `FileList`, `FileItem`, `FileUpload` | list rows, markers, breadcrumbs |
| B4 Preview | `FilePreview` | |
| B5 Share | `ShareDialog` | fingerprint and verified marker shown; "key changed" callout drawn now, wired in the handoff stage |
| B6 Shared with me | the shared-with-me view in `FilesPage` | handoff marker slot |
| B7 Settings | `SettingsPage`, `TwoFactorSettings`, `TwoFactorSetup` | stage 2 adds "Lock and look"; this stage lays out the page |
| Components | `Button`, `Input`, `Card`, `Modal`, `Toast`, `ProgressBar`, `Spinner`, plus new `Breadcrumbs`, `StateBadge`, `Fingerprint`, `EmptyState`, `ListRow` | |
| Layouts | `AuthLayout`, `DashboardLayout` (sidebar with lock footer), `PublicLayout` | |

## 3. Rules

- The six "spine" decisions in `docs/design/output/README.md` are binding. Everything under "latitude" may differ from the artboard.
- Serif only on sentences that state a consequence. Operational text is sans.
- No new strings for irreversible acts; those exist only in stage 2 and the handoff stage.
- Phone width 360 works for every screen; no horizontal scroll.
- Each component keeps its current props unless a prop is unused after the restyle.

## 4. Verification

Client typecheck and unit tests unchanged or extended; the end-to-end run still passes since behaviour is untouched; a Playwright smoke that loads every route at 1280 and 390 and screenshots it is added under `client/e2e-browser/` and run in CI's client job. Screenshots are reviewed by the owner against the artboards; the reviewer notes deviations in `docs/design/decisions.md`.
