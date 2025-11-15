# CrypticStorage

A zero-knowledge, end-to-end encrypted cloud storage platform that prioritizes user privacy and security. All encryption and decryption happens client-side, ensuring that the server never has access to unencrypted data or encryption keys.

## Features

### Security & Privacy
- **Zero-Knowledge Architecture**: Server never sees encryption keys or unencrypted data
- **End-to-End Encryption**: AES-256-GCM encryption performed client-side
- **Secure Key Derivation**: PBKDF2 with 100,000 iterations
- **RSA-4096 Key Pairs**: For secure file sharing between users
- **Two-Factor Authentication**: TOTP-based 2FA for enhanced account security

### File Management
- **Drag-and-Drop Upload**: Easy file uploads with visual feedback
- **Folder Organization**: Create folders and organize your files
- **File Versioning**: Keep track of file versions (last 10 versions)
- **Large File Support**: Upload files up to 5GB with chunked uploading
- **File Sharing**: Share files securely with password protection and expiration dates

### User Experience
- **Modern UI**: Clean, responsive interface built with React and TailwindCSS
- **Dark Mode**: Beautiful dark mode support
- **Real-time Progress**: Live upload/download progress tracking
- **Storage Analytics**: Detailed storage usage statistics and charts
- **Cross-Platform**: Works on desktop and mobile browsers

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast builds
- **TailwindCSS** for styling
- **Zustand** for state management
- **React Router** for routing
- **Web Crypto API** for encryption
- **Recharts** for data visualization
- **Framer Motion** for animations

### Backend
- **Node.js** with TypeScript
- **Express.js** web framework
- **Prisma** ORM with PostgreSQL
- **Redis** for caching and sessions
- **MinIO** (S3-compatible) for object storage
- **JWT** for authentication
- **bcrypt** for password hashing

### Infrastructure
- **Docker** & Docker Compose
- **PostgreSQL 16** database
- **Redis 7** cache
- **MinIO** object storage
- **Nginx** reverse proxy

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 20+ (for local development)
- npm or yarn

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/crypticstorage.git
   cd crypticstorage
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and set JWT_SECRET and other variables
   ```

3. **Start all services**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**
   ```bash
   docker-compose exec api npx prisma migrate deploy
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - API: http://localhost:4000
   - MinIO Console: http://localhost:9001

### Local Development

#### Backend Setup

```bash
cd server

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The API will be available at http://localhost:4000

#### Frontend Setup

```bash
cd client

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev
```

The client will be available at http://localhost:3000

## Available Commands

### Using Make

```bash
make build          # Build all Docker images
make up             # Start all services
make down           # Stop all services
make logs           # View logs from all services
make clean          # Remove all containers and volumes
make test           # Run tests
make migrate        # Run database migrations
make dev-server     # Start server in dev mode
make dev-client     # Start client in dev mode
make health         # Check service health
```

### Using npm

#### Server Commands
```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run start       # Start production server
npm test            # Run tests
npm run migrate     # Run migrations
```

#### Client Commands
```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run preview     # Preview production build
npm test            # Run tests
```

## Project Structure

```
crypticstorage/
├── client/                 # Frontend React application
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API and crypto services
│   │   ├── stores/        # Zustand state stores
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript types
│   │   └── utils/         # Utility functions
│   ├── Dockerfile         # Client Docker configuration
│   └── package.json
├── server/                # Backend Node.js application
│   ├── src/
│   │   ├── controllers/   # Request handlers
│   │   ├── services/      # Business logic
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Express middleware
│   │   ├── config/        # Configuration files
│   │   └── utils/         # Utility functions
│   ├── prisma/            # Database schema and migrations
│   ├── tests/             # Test files
│   ├── Dockerfile         # Server Docker configuration
│   └── package.json
├── project_standards/     # Project documentation
│   ├── PRD.md            # Product Requirements Document
│   └── SPECIFICATION.md  # Technical Specification
├── docker-compose.yml    # Docker Compose configuration
├── Makefile              # Build automation
└── README.md             # This file
```

## Security Considerations

### Client-Side Encryption

All files are encrypted on the client side before being uploaded to the server:

1. User enters password
2. Password is hashed using PBKDF2 (100,000 iterations) to derive encryption key
3. Master key is generated and encrypted with derived key
4. Files are encrypted with AES-256-GCM using unique file keys
5. File keys are encrypted with master key
6. Only encrypted data is sent to server

### Key Management

- Master keys are never transmitted to or stored on the server
- Private keys are encrypted with master key
- File keys are encrypted with master key
- Shared files use RSA key exchange

### Zero-Knowledge Architecture

The server has:
- ✅ Encrypted files
- ✅ Encrypted filenames
- ✅ Encrypted file keys
- ✅ User public keys (for sharing)

The server NEVER has:
- ❌ Unencrypted files
- ❌ Master keys
- ❌ Private keys (unencrypted)
- ❌ File encryption keys (unencrypted)

## Testing

### Run all tests
```bash
# Server tests
cd server && npm test

# Client tests
cd client && npm test
```

### Test Coverage
```bash
# Server coverage
cd server && npm test -- --coverage

# Client coverage
cd client && npm test -- --coverage
```

## License

MIT License - see LICENSE file for details

---

**CrypticStorage** - Your files, your keys, your privacy.