# CrypticStorage - Frontend

Zero-knowledge encrypted file storage frontend application built with React, TypeScript, and Tailwind CSS.

## Features

- **Zero-Knowledge Encryption**: Files are encrypted on the client-side before upload
- **Modern UI**: Built with React 18 and Tailwind CSS
- **Dark Mode Support**: Automatic theme switching based on user preference
- **Responsive Design**: Optimized for all screen sizes
- **Type Safety**: Full TypeScript support
- **State Management**: Zustand for efficient state management
- **Client-Side Routing**: React Router for seamless navigation
- **Error Boundaries**: Graceful error handling with fallback UI
- **Code Splitting**: Lazy loading for optimal performance
- **PWA Ready**: Service worker support for offline functionality

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Zustand** - State management
- **Axios** - HTTP client
- **Framer Motion** - Animations
- **Headless UI** - Accessible UI components
- **Heroicons** - Icon library
- **Recharts** - Data visualization
- **React Dropzone** - File upload
- **QRCode** - QR code generation for 2FA

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Modern web browser with JavaScript enabled

## Installation

1. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:

```env
VITE_API_URL=http://localhost:3000/api
VITE_APP_NAME=CrypticStorage
VITE_APP_VERSION=1.0.0
```

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run test` - Run tests with Vitest
- `npm run test:ui` - Run tests with UI
- `npm run type-check` - Check TypeScript types

## Project Structure

```
client/
├── public/                 # Static assets
├── src/
│   ├── components/        # React components
│   │   ├── auth/         # Authentication components
│   │   ├── common/       # Reusable UI components
│   │   ├── dashboard/    # Dashboard components
│   │   ├── files/        # File management components
│   │   ├── ErrorBoundary.tsx
│   │   ├── Layout.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/            # Page components
│   │   ├── HomePage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── FilesPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── services/         # API and service layer
│   │   ├── api.service.ts
│   │   ├── auth.service.ts
│   │   ├── crypto.service.ts
│   │   ├── file.service.ts
│   │   └── storage.service.ts
│   ├── stores/           # Zustand state stores
│   │   ├── auth.store.ts
│   │   ├── file.store.ts
│   │   └── ui.store.ts
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── App.tsx           # Main app component
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
├── index.html            # HTML template
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── vite.config.ts        # Vite config
├── tailwind.config.js    # Tailwind config
└── postcss.config.js     # PostCSS config
```

## Building for Production

Build the application:

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

Preview the production build:

```bash
npm run preview
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3000/api` |
| `VITE_APP_NAME` | Application name | `CrypticStorage` |
| `VITE_APP_VERSION` | Application version | `1.0.0` |

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Security

- All encryption happens client-side using the Web Crypto API
- Files are encrypted with AES-256-GCM before upload
- Zero-knowledge architecture - the server never sees unencrypted data
- Secure authentication with JWT tokens
- Two-factor authentication (2FA) support
- Content Security Policy (CSP) headers
- HTTPS required in production

## Performance

- Code splitting with React.lazy()
- Image optimization
- CSS purging in production
- Gzip/Brotli compression
- Service worker caching
- Bundle size analysis with `vite-plugin-bundle-analyzer`

## Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatible
- High contrast mode support
- Focus indicators
- ARIA labels and roles

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## License

This project is part of CrypticStorage and is licensed under the MIT License.

## Support

For issues and questions:
- GitHub Issues: https://github.com/crypticstorage/crypticstorage/issues
- Documentation: https://docs.crypticstorage.com
- Email: support@crypticstorage.com

## Roadmap

- [ ] Offline support with Service Workers
- [ ] File sharing with expiration
- [ ] Folder organization
- [ ] Advanced search and filters
- [ ] File versioning
- [ ] Collaborative editing
- [ ] Mobile apps (iOS/Android)
- [ ] Desktop apps (Electron)
- [ ] Browser extensions
