# The current UI, for inventory only

The client today is a generic Tailwind look: indigo gradient landing, white cards, gray text, `primary` sky-blue and `dark` slate palettes in `client/tailwind.config.js`, CSS variables in `client/src/index.css`. None of it should be kept for its own sake.

Routes that exist: `/`, `/login`, `/register`, `/s/:token`, `/dashboard`, `/files`, `/files/:folderId`, `/settings`, `/404`.

Pages: Home, Login (with a two-factor step), Register, Dashboard (QuickStats, RecentFiles, StorageChart), Files (FileList, FileItem, FileUpload with progress, FilePreview, ShareDialog), Settings (Profile, Change password, Master key fingerprint, Two-factor authentication, Storage), Shared (public link page), NotFound.

Layouts: AuthLayout, DashboardLayout (sidebar navigation), PublicLayout.

Common components: Button, Card, Input, Modal, ProgressBar, Spinner, Toast.

What does not exist yet and is new in `03-screens-and-flows.md`: the signup contract screens, email verification, the locked screen as a designed state (a plain form exists), witnesses, handoff rules, recipient and witness flows, admin, delete account confirmation, all email templates.
