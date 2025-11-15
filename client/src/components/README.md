# CrypticStorage React UI Components

Comprehensive React TypeScript components for the CrypticStorage application.

## Overview

All components are built with:
- **TypeScript** with proper prop types
- **TailwindCSS** for styling
- **Heroicons** for icons
- **Framer Motion** for animations
- Full **responsive** design
- **Loading** and **error** states
- **Dark mode** support

## Component Structure

```
client/src/components/
├── common/          # Reusable UI components
├── auth/            # Authentication components
├── files/           # File management components
├── dashboard/       # Dashboard widgets
└── index.ts         # Main export file
```

## Common Components (`/common`)

### Button
Reusable button component with variants and sizes.

**Features:**
- Variants: `primary`, `secondary`, `danger`, `ghost`
- Sizes: `sm`, `md`, `lg`
- Loading state with spinner
- Left/right icon support
- Framer Motion animations

**Usage:**
```tsx
import { Button } from '@/components/common';

<Button variant="primary" size="md" isLoading={false}>
  Click Me
</Button>
```

### Input
Text input with validation states and icons.

**Features:**
- Error and success states
- Helper text support
- Left/right icon support
- Validation feedback with animations

**Usage:**
```tsx
import { Input } from '@/components/common';

<Input
  label="Email"
  type="email"
  error="Invalid email"
  leftIcon={<EnvelopeIcon />}
/>
```

### Modal
Modal dialog with backdrop using HeadlessUI Dialog.

**Features:**
- Multiple sizes: `sm`, `md`, `lg`, `xl`, `full`
- Backdrop blur effect
- Animated transitions
- Optional close button

**Usage:**
```tsx
import { Modal } from '@/components/common';

<Modal
  isOpen={isOpen}
  onClose={onClose}
  title="Modal Title"
  size="md"
>
  Content here
</Modal>
```

### Spinner
Loading spinner with size variants.

**Features:**
- Sizes: `sm`, `md`, `lg`, `xl`
- Optional label
- `SpinnerOverlay` for full-screen loading

**Usage:**
```tsx
import { Spinner, SpinnerOverlay } from '@/components/common';

<Spinner size="md" label="Loading..." />
<SpinnerOverlay label="Processing..." />
```

### ProgressBar
Progress bar for uploads and operations.

**Features:**
- Linear and circular variants
- Color variants: `default`, `success`, `warning`, `danger`
- Animated progress
- Optional percentage display

**Usage:**
```tsx
import { ProgressBar, CircularProgress } from '@/components/common';

<ProgressBar progress={75} label="Uploading..." />
<CircularProgress progress={50} size={120} />
```

### Toast
Toast notifications with different types.

**Features:**
- Types: `success`, `error`, `warning`, `info`
- Auto-dismiss with configurable duration
- Multiple position options
- Stacked notifications

**Usage:**
```tsx
import { ToastContainer } from '@/components/common';

<ToastContainer
  toasts={toasts}
  position="top-right"
/>
```

### Card
Card container with variants.

**Features:**
- Variants: `default`, `bordered`, `elevated`
- Padding options
- Hoverable effect
- Sub-components: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`

**Usage:**
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common';

<Card variant="bordered">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

## Auth Components (`/auth`)

### LoginForm
Login form with email/password and 2FA support.

**Features:**
- Email/password validation
- Two-factor authentication support
- Auto-show 2FA input on requirement
- Forgot password link
- Sign up link

**Usage:**
```tsx
import { LoginForm } from '@/components/auth';

<LoginForm
  onSubmit={handleLogin}
  onForgotPassword={() => {}}
  onRegister={() => {}}
  isLoading={false}
/>
```

### RegisterForm
Registration form with password strength indicator.

**Features:**
- Email validation
- Password strength indicator (5 levels)
- Password confirmation
- Display name field
- Terms acceptance checkbox
- Real-time password requirements validation

**Usage:**
```tsx
import { RegisterForm } from '@/components/auth';

<RegisterForm
  onSubmit={handleRegister}
  onLogin={() => {}}
  isLoading={false}
/>
```

### TwoFactorSetup
QR code display and TOTP verification.

**Features:**
- QR code display for authenticator apps
- Manual secret key with copy functionality
- 6-digit code verification
- Success animation
- Security notice

**Usage:**
```tsx
import { TwoFactorSetup } from '@/components/auth';

<TwoFactorSetup
  secret="SECRET_KEY"
  qrCodeUrl="data:image/png;base64,..."
  onVerify={handleVerify}
  onComplete={handleComplete}
/>
```

## File Components (`/files`)

### FileList
File list with grid/list view and sorting.

**Features:**
- Grid and list view modes
- Search functionality
- Sort by name, size, date
- Filter panel
- Empty state
- Loading state

**Usage:**
```tsx
import { FileList } from '@/components/files';

<FileList
  files={files}
  viewMode="grid"
  onFileClick={handleFileClick}
  onFileDownload={handleDownload}
  onFileDelete={handleDelete}
  onFileShare={handleShare}
/>
```

### FileItem
Individual file with icon, name, size, date, and actions.

**Features:**
- File type icons with colors
- Grid and list view variants
- Thumbnail support for images
- Hover actions
- Context menu with HeadlessUI Menu
- File metadata display

**Usage:**
```tsx
import { FileItem } from '@/components/files';

<FileItem
  id="file-id"
  name="document.pdf"
  size={1024000}
  mimeType="application/pdf"
  uploadedAt="2025-11-15T10:00:00Z"
  viewMode="grid"
  onDownload={() => {}}
/>
```

### FileUpload
Drag-and-drop upload zone with react-dropzone.

**Features:**
- Drag and drop support
- File type restrictions
- File size limits
- Multiple file upload
- Upload progress tracking
- File validation
- Preview of uploading files

**Usage:**
```tsx
import { FileUpload } from '@/components/files';

<FileUpload
  onUpload={handleUpload}
  maxFiles={10}
  maxSize={100 * 1024 * 1024}
  acceptedFileTypes={['image/*', 'application/pdf']}
/>
```

### FilePreview
File preview for images, videos, audio, PDFs.

**Features:**
- Decrypt and display encrypted files
- Image zoom controls
- Video/audio playback
- PDF viewer
- Navigation between files
- Download and share actions

**Usage:**
```tsx
import { FilePreview } from '@/components/files';

<FilePreview
  isOpen={isOpen}
  onClose={onClose}
  file={currentFile}
  decryptFile={handleDecrypt}
  onDownload={handleDownload}
  onShare={handleShare}
  onNavigate={handleNavigate}
/>
```

### ShareDialog
Create share link with options (password, expiry, download limit).

**Features:**
- Password protection
- Expiry date configuration
- Download limit
- Link preview
- Copy to clipboard
- Existing shares list

**Usage:**
```tsx
import { ShareDialog } from '@/components/files';

<ShareDialog
  isOpen={isOpen}
  onClose={onClose}
  file={file}
  onCreateShare={handleCreateShare}
  existingShares={existingShares}
/>
```

## Dashboard Components (`/dashboard`)

### StorageChart
Storage usage chart with Recharts.

**Features:**
- Pie chart, bar chart, and simple variants
- Storage breakdown by file type
- Color-coded file types
- Responsive design
- Custom tooltips

**Usage:**
```tsx
import { StorageChart } from '@/components/dashboard';

<StorageChart
  data={{
    used: 5000000000,
    total: 10000000000,
    breakdown: {
      images: 2000000000,
      videos: 1500000000,
      documents: 1000000000,
      audio: 300000000,
      other: 200000000
    }
  }}
  variant="pie"
/>
```

### RecentFiles
Recent files widget for dashboard.

**Features:**
- Displays recent uploads
- File type icons
- Time ago formatting
- Click to view file
- View all button
- Empty state

**Usage:**
```tsx
import { RecentFiles } from '@/components/dashboard';

<RecentFiles
  files={recentFiles}
  onFileClick={handleFileClick}
  onViewAll={handleViewAll}
  maxFiles={5}
/>
```

### QuickStats
Quick statistics cards with trends.

**Features:**
- Multiple stat cards
- Trend indicators (up/down arrows)
- Color-coded icons
- Percentage change display
- Compact and default variants
- Helper hook `useQuickStats`

**Usage:**
```tsx
import { QuickStats, useQuickStats } from '@/components/dashboard';

const stats = useQuickStats({
  totalFiles: 150,
  totalUploads: 200,
  sharedFiles: 25,
  storageUsed: 5000000000
});

<QuickStats stats={stats} variant="default" />
```

## Dependencies Required

Install the following packages to use these components:

```bash
npm install \
  react \
  react-dom \
  typescript \
  tailwindcss \
  @headlessui/react \
  @heroicons/react \
  framer-motion \
  react-dropzone \
  recharts \
  class-variance-authority
```

## Import Examples

### Individual imports:
```tsx
import { Button } from '@/components/common/Button';
import { LoginForm } from '@/components/auth/LoginForm';
```

### Category imports:
```tsx
import { Button, Input, Modal } from '@/components/common';
import { LoginForm, RegisterForm } from '@/components/auth';
```

### All components:
```tsx
import { Button, Input, LoginForm, FileList } from '@/components';
```

## Styling

All components use TailwindCSS with dark mode support. Ensure your `tailwind.config.js` includes:

```js
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

## TypeScript

All components are fully typed with TypeScript. Import types alongside components:

```tsx
import { Button, type ButtonProps } from '@/components/common';
```

## Accessibility

Components follow accessibility best practices:
- Keyboard navigation support
- ARIA labels and roles
- Focus management
- Screen reader friendly
- Color contrast compliance

## License

Part of the CrypticStorage project.
