# Design system

Name for the direction: **document of record.** Cool paper, black ink, one deep green. Calm, exact, unhurried, as `01-product-core.md` asks. No gradients, no illustration, no glass, no emoji.

## Color

Every color is a token with a light and a dark value. Values are in `tokens.css`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F1F2F0` | `#0D0F0E` | Page ground |
| `--surface` | `#FFFFFF` | `#151816` | Cards, bars, sheets, inputs |
| `--surface-2` | `#F6F7F5` | `#1B1F1C` | Hover, read-only fields, table head |
| `--sunk` | `#E8EAE7` | `#0A0C0B` | Progress tracks, segmented-control ground |
| `--line` | `#DCDFDA` | `#272C29` | Dividers, card borders |
| `--line-strong` | `#BCC1BA` | `#3A413C` | Control borders |
| `--ink` | `#151816` | `#E8EBE8` | Primary text |
| `--ink-2` | `#454B47` | `#B2B9B3` | Secondary text |
| `--ink-3` | `#5F6661` | `#8F9790` | Meta, captions (still 4.5:1 on `--bg` and `--surface`) |
| `--accent` | `#1D5844` | `#7EC4A7` | Primary buttons, focus ring, active nav |
| `--accent-ink` | `#FFFFFF` | `#0D0F0E` | Text on `--accent` |
| `--accent-soft` / `--accent-text` | `#E1EDE7` / `#1D5844` | `#16302A` / `#8FD0B4` | Active badge, folder icon, rule banner |
| `--warn-soft` / `--warn-text` / `--warn-line` | `#FAEDD3` / `#7F4E00` / `#E3C385` | `#2B2213` / `#E9B460` / `#5A4520` | Rule in warning, open release request, overlap warning |
| `--danger` / `--danger-ink` | `#A12A2A` / `#FFFFFF` | `#EE8A84` / `#1A0B0A` | Destroy and revoke buttons |
| `--danger-soft` / `--danger-text` | `#F8E3E1` / `#9A2626` | `#311918` / `#F29C96` | Errors, key-changed warning |
| `--info-soft` / `--info-text` | `#E2EAF5` / `#1D4A85` | `#17233A` / `#9BBDEB` | Released states, shared marker |

Rules: one accent; state colors are never used decoratively; dark mode is its own palette, not an inversion (the accent lightens so it keeps contrast, and dark buttons carry dark text).

Theme selection: `prefers-color-scheme` by default, with a System / Light / Dark override in Settings that writes `data-theme` on `<html>`.

## Type

Three families from Google Fonts. Load `Newsreader:opsz,wght@6..72,500;6..72,600`, `Instrument Sans:wght@400;500;600`, `IBM Plex Mono:wght@400;500`.

| Role | Face | Desktop | Phone | Where |
|---|---|---|---|---|
| Hero | Newsreader 500 | 64/66 | 44/48 | Landing only |
| Fact | Newsreader 600 | 44/50 | 30/36 | One-fact screens, locked screen, set-aside notice |
| Title | Instrument Sans 600 | 28/34 | 24/30 | Page titles |
| Section | Instrument Sans 600 | 16/22 | 16/22 | Section and card heads |
| Lead | Instrument Sans 400 | 17/26 | 17/26 | Supporting text under a fact |
| Body | Instrument Sans 400 | 15/22 | 15/22 | Everything else |
| Small | Instrument Sans 400 | 13/18 | 13/18 | Meta, help text |
| Mono | IBM Plex Mono 500 | 14/22, tracking .06em | same | Fingerprints, codes, URLs, step counters |

Use `text-wrap: balance` on facts and `font-variant-numeric: tabular-nums` on sizes, dates and counts.

## Spacing, radius, elevation

4 px base: 4, 8, 12, 16, 20, 24, 32, 40, 56, 72. Phone gutter 16; desktop page padding 56; card padding 20.

Radius: 5 badge, 8 control, 12 card, 14 dialog, 18 sheet top. Phone mockups use a 30 px frame radius only for presentation.

Elevation is used twice: dialogs and the upload tray. Everything else is flat with a 1 px `--line` border.

## Layout

- **Phone (to 719 px):** 60 px top bar (brand, lock button), content, four-tab bar (Home, Files, Shared, Settings; Admin is a fifth for admins). Dialogs are bottom sheets.
- **Desktop (720 px up):** 240 px sidebar (brand, nav, lock state, Lock now, account email), content to 1000 px. Dashboard adds a 320 px status column.
- **One-fact screens and public pages:** no app chrome. Brand top left, one quiet action top right, a single 560 px column (400 px for forms).

The canvas implements the switch with a container query at 720 px; in the app a Tailwind `md:` breakpoint at the same width does the job.

## Motion

Framer Motion, small: 150 ms fade for page changes, 200 ms slide-up for sheets, 120 ms for toasts. One-fact screens fade in and nothing on them moves. Honour `prefers-reduced-motion` by dropping slides to fades.

## Components

Each maps to one React component. Class names refer to `canvas/cs.css`.

| Component | Spec |
|---|---|
| **Button** (`.btn`) | 44 px tall, 8 px radius, 15/600. Primary (accent fill), Secondary (surface, strong border), Danger (danger fill, used only where the click destroys or releases), Quiet (text only, for Back, Cancel, Decline). Small variant 36 px for dense rows. Disabled at 42% opacity, never hidden. |
| **Input** (`.input`) | 44 px, 1 px strong border, label above, help below in Small. Password has a reveal icon button inside the right edge. Code input is mono 26 px with wide tracking, one field (not six boxes) so paste and autofill work. Error: red border plus one line under. |
| **Card** (`.card`) | Surface, 1 px line, 12 radius, 20 padding. No left-border accents. |
| **Modal / sheet** (`.sheet`) | Desktop: 560 px centred (880 for preview), head with title and close, foot with actions right-aligned. Phone: bottom sheet with a grab handle, actions stacked full width. Irreversible confirmations are never modals; they are one-fact screens. |
| **Toast** (`.toast`) | Inverse colors, one line, optional quiet action, bottom centre on phone, bottom right on desktop. |
| **ProgressBar** (`.bar`) | 6 px, rounded, accent fill; amber fill for vote progress on an open release request. |
| **Spinner** (`.spin`) | 18 px ring. Always paired with words ("Encrypting…", "Decrypting names…"). |
| **Breadcrumbs** (`.crumbs`) | Files › Folder › Folder, last one bold and `aria-current`. |
| **List row** (`.li`) | 60 px minimum. File: icon, name, meta, markers, ⋯. Folder: green-tinted icon, item count. Rule: item, recipients, next date, state badge. Witness: email, short fingerprint, state, remove. On desktop the file list becomes a four-column table (name, size, modified, actions). |
| **State badge** (`.badge`) | Dot plus word: Active, Warning, Released by timer, Released by quorum, Revoked (outlined, hollow dot), Pending. |
| **Marker** (`.mk`) | 12 px icon plus word on file rows: Handoff, Shared with N, Link · N days left. |
| **Fingerprint** (`.fp`) | Mono, eight groups of four in a 4 × 2 grid, `aria-label` with the whole string. |
| **One-fact screen** (`.fact`) | Optional step counter and ticks (mono "Before you begin · 2 of 4"), the fact in Newsreader, at most two sentences of Lead, optional single field, then one action and a quiet back. On phone the action sits at the bottom of the screen; on desktop it follows the text. |
| **Empty state** (`.empty`) | Dashed ring with one icon, one bold line, one small line, one action. |
| **Table** (`.table`) | Admin only. Surface-2 header, 14 px rows, quota as text plus bar. On phone it becomes a list. |
| **Callout** (`.callout`) | Tinted block for the two warnings that must interrupt: key changed (danger) and witness-is-also-recipient (warn). Used nowhere else. |

## Icons

Outline, 1.6 stroke, 20 px, `currentColor`, always with a text label or `aria-label`. Heroicons outline covers all but the hourglass used for "handoff"; keep that one as a custom SVG (path in `canvas/Main.dc.html`) or pick a Heroicons substitute and use it consistently.

The mark is a rounded square with a keyhole. It is a placeholder for a real logo.
