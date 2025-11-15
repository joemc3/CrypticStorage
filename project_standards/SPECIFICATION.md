# Technical Specification: CrypticStorage

## System Architecture

### Overview

CrypticStorage follows a client-server architecture with a strong emphasis on client-side security. The system is composed of four main layers:

1. **Client Layer**: React-based SPA handling encryption/decryption
2. **API Layer**: RESTful Node.js backend
3. **Storage Layer**: Object storage for encrypted files
4. **Database Layer**: PostgreSQL for metadata

```
┌─────────────────────────────────────────────────────────┐
│                     Client Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   React UI   │  │  Crypto Lib  │  │  API Client  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            │
                   HTTPS (TLS 1.3)
                            │
┌─────────────────────────────────────────────────────────┐
│                      API Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Express    │  │     Auth     │  │   Storage    │  │
│  │   Router     │  │   Service    │  │   Service    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
              │                           │
    ┌─────────┴─────────┐        ┌────────┴────────┐
    │                   │        │                 │
┌───▼──────────┐  ┌────▼─────┐  ┌▼────────────┐   │
│  PostgreSQL  │  │  Redis   │  │    MinIO    │   │
│   (Metadata) │  │ (Cache)  │  │  (Storage)  │   │
└──────────────┘  └──────────┘  └─────────────┘   │
                                                    │
```

## Data Model

### Database Schema

#### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    master_key_encrypted TEXT NOT NULL,  -- Encrypted with password-derived key
    public_key TEXT NOT NULL,             -- RSA public key for sharing
    private_key_encrypted TEXT NOT NULL,  -- RSA private key encrypted with master key
    totp_secret_encrypted VARCHAR(255),   -- Encrypted TOTP secret
    storage_quota BIGINT DEFAULT 10737418240, -- 10GB default
    storage_used BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
```

#### files
```sql
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    filename_encrypted VARCHAR(500) NOT NULL,  -- Encrypted filename
    filename_iv VARCHAR(100) NOT NULL,         -- IV for filename encryption
    file_key_encrypted TEXT NOT NULL,          -- File encryption key, encrypted with user's master key
    file_size BIGINT NOT NULL,                 -- Original file size
    encrypted_size BIGINT NOT NULL,            -- Encrypted file size
    mime_type VARCHAR(100),
    storage_path VARCHAR(500) NOT NULL,        -- Path in object storage
    file_hash VARCHAR(128) NOT NULL,           -- SHA-256 hash of encrypted file
    encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    thumbnail_path VARCHAR(500),               -- Encrypted thumbnail
    version INT DEFAULT 1,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_parent_folder ON files(parent_folder_id);
CREATE INDEX idx_files_hash ON files(file_hash);
CREATE INDEX idx_files_deleted ON files(is_deleted);
```

#### folders
```sql
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name_encrypted VARCHAR(500) NOT NULL,
    name_iv VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);
```

#### file_versions
```sql
CREATE TABLE file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    file_key_encrypted TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(file_id, version_number)
);

CREATE INDEX idx_file_versions_file_id ON file_versions(file_id);
```

#### shares
```sql
CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    share_token VARCHAR(128) UNIQUE NOT NULL,
    file_key_encrypted TEXT NOT NULL,          -- File key encrypted for sharing
    password_hash VARCHAR(255),                 -- Optional password protection
    expires_at TIMESTAMP,
    max_downloads INT,
    download_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP
);

CREATE INDEX idx_shares_token ON shares(share_token);
CREATE INDEX idx_shares_file_id ON shares(file_id);
CREATE INDEX idx_shares_expires ON shares(expires_at);
```

#### user_shares
```sql
CREATE TABLE user_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    file_key_encrypted TEXT NOT NULL,          -- File key encrypted with recipient's public key
    permission VARCHAR(20) DEFAULT 'read',     -- read, write
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(file_id, shared_with_user_id)
);

CREATE INDEX idx_user_shares_file ON user_shares(file_id);
CREATE INDEX idx_user_shares_recipient ON user_shares(shared_with_user_id);
```

#### audit_logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,              -- login, upload, download, share, delete
    resource_type VARCHAR(50),                 -- file, folder, share
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
```

#### sessions
```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

## API Specification

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securepassword",
  "masterKeyEncrypted": "base64...",
  "publicKey": "base64...",
  "privateKeyEncrypted": "base64...",
  "salt": "base64..."
}
```

**Response:**
```json
{
  "success": true,
  "userId": "uuid",
  "token": "jwt-token"
}
```

#### POST /api/auth/login
Authenticate user and create session.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "totpCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "masterKeyEncrypted": "base64...",
    "privateKeyEncrypted": "base64...",
    "storageQuota": 10737418240,
    "storageUsed": 1234567
  }
}
```

#### POST /api/auth/logout
Invalidate current session.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true
}
```

### File Management Endpoints

#### POST /api/files/upload
Upload an encrypted file.

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data:**
```
file: <encrypted-file-blob>
metadata: {
  "filenameEncrypted": "base64...",
  "filenameIv": "base64...",
  "fileKeyEncrypted": "base64...",
  "mimeType": "image/png",
  "fileSize": 1234567,
  "encryptedSize": 1234600,
  "fileHash": "sha256...",
  "parentFolderId": "uuid or null"
}
```

**Response:**
```json
{
  "success": true,
  "file": {
    "id": "uuid",
    "filenameEncrypted": "base64...",
    "fileSize": 1234567,
    "createdAt": "2025-11-15T10:30:00Z"
  }
}
```

#### GET /api/files
List user's files.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `folderId`: UUID (optional, null for root)
- `limit`: number (default: 50)
- `offset`: number (default: 0)

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "id": "uuid",
      "filenameEncrypted": "base64...",
      "filenameIv": "base64...",
      "fileKeyEncrypted": "base64...",
      "fileSize": 1234567,
      "mimeType": "image/png",
      "createdAt": "2025-11-15T10:30:00Z",
      "updatedAt": "2025-11-15T10:30:00Z"
    }
  ],
  "total": 100
}
```

#### GET /api/files/:id
Get file metadata.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "file": {
    "id": "uuid",
    "filenameEncrypted": "base64...",
    "filenameIv": "base64...",
    "fileKeyEncrypted": "base64...",
    "fileSize": 1234567,
    "encryptedSize": 1234600,
    "mimeType": "image/png",
    "thumbnailPath": "path...",
    "version": 1,
    "createdAt": "2025-11-15T10:30:00Z",
    "updatedAt": "2025-11-15T10:30:00Z"
  }
}
```

#### GET /api/files/:id/download
Download encrypted file.

**Headers:** `Authorization: Bearer <token>`

**Response:** Binary stream of encrypted file

#### DELETE /api/files/:id
Delete a file (soft delete).

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

### Sharing Endpoints

#### POST /api/shares
Create a share link.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "fileId": "uuid",
  "fileKeyEncrypted": "base64...",
  "password": "optional-password",
  "expiresIn": 86400,
  "maxDownloads": 10
}
```

**Response:**
```json
{
  "success": true,
  "share": {
    "id": "uuid",
    "token": "secure-random-token",
    "url": "https://crypticstorage.com/s/secure-random-token",
    "expiresAt": "2025-11-16T10:30:00Z"
  }
}
```

#### GET /api/shares/:token
Get share information.

**Response:**
```json
{
  "success": true,
  "share": {
    "fileKeyEncrypted": "base64...",
    "filenameEncrypted": "base64...",
    "filenameIv": "base64...",
    "fileSize": 1234567,
    "requiresPassword": true,
    "expiresAt": "2025-11-16T10:30:00Z",
    "remainingDownloads": 8
  }
}
```

#### POST /api/shares/:token/download
Download file from share link.

**Request:**
```json
{
  "password": "optional-password"
}
```

**Response:** Binary stream of encrypted file

#### DELETE /api/shares/:id
Revoke a share link.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Share revoked successfully"
}
```

### Folder Endpoints

#### POST /api/folders
Create a new folder.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "nameEncrypted": "base64...",
  "nameIv": "base64...",
  "parentFolderId": "uuid or null"
}
```

**Response:**
```json
{
  "success": true,
  "folder": {
    "id": "uuid",
    "nameEncrypted": "base64...",
    "createdAt": "2025-11-15T10:30:00Z"
  }
}
```

#### GET /api/folders/:id
Get folder contents.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "folder": {
    "id": "uuid",
    "nameEncrypted": "base64...",
    "nameIv": "base64...",
    "parentFolderId": "uuid or null"
  },
  "folders": [...],
  "files": [...]
}
```

## Encryption Specification

### Client-Side Encryption Flow

#### User Registration
1. User provides email and password
2. Generate random salt (32 bytes)
3. Derive key from password using PBKDF2:
   - Algorithm: PBKDF2-SHA256
   - Iterations: 100,000
   - Salt: Random 32 bytes
   - Output: 256-bit key
4. Generate random master key (256 bits)
5. Generate RSA-4096 key pair for sharing
6. Encrypt master key with derived key (AES-256-GCM)
7. Encrypt private key with master key (AES-256-GCM)
8. Send to server:
   - Email, username, password hash
   - Encrypted master key
   - Public key (unencrypted)
   - Encrypted private key
   - Salt

#### File Encryption
1. Generate random file key (256 bits)
2. Generate random IV (96 bits for GCM)
3. Read file in chunks (1MB)
4. Encrypt each chunk with AES-256-GCM:
   - Key: File key
   - IV: Unique per chunk
   - Additional data: Chunk index
5. Encrypt filename with master key
6. Encrypt file key with master key
7. Upload encrypted file and metadata

#### File Decryption
1. Retrieve encrypted file key from metadata
2. Decrypt file key using master key
3. Download encrypted file
4. Decrypt in chunks using file key
5. Decrypt filename using master key
6. Present decrypted file to user

#### Sharing Encryption
For anonymous links:
1. Wrap file key with random share key
2. Include share key in URL fragment (#key)
3. Server never sees the key (fragment not sent to server)

For user-to-user sharing:
1. Retrieve recipient's public key
2. Encrypt file key with recipient's public key (RSA-OAEP)
3. Store encrypted file key for recipient
4. Recipient decrypts with their private key

### Key Derivation

```javascript
// Password to encryption key
async function deriveKeyFromPassword(password, salt) {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
```

### File Encryption

```javascript
// Encrypt file
async function encryptFile(file, fileKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    fileKey,
    await file.arrayBuffer()
  );

  return {
    encryptedData: encrypted,
    iv: iv
  };
}
```

## Frontend Architecture

### Technology Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS + HeadlessUI
- **State Management**: Zustand
- **Routing**: React Router v6
- **Crypto**: Web Crypto API
- **HTTP Client**: Axios
- **File Upload**: react-dropzone
- **Icons**: Heroicons
- **Charts**: Recharts
- **Animations**: Framer Motion

### Component Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   └── MFASetup.tsx
│   ├── files/
│   │   ├── FileList.tsx
│   │   ├── FileUpload.tsx
│   │   ├── FilePreview.tsx
│   │   └── FileActions.tsx
│   ├── folders/
│   │   ├── FolderTree.tsx
│   │   └── FolderBreadcrumb.tsx
│   ├── shares/
│   │   ├── ShareDialog.tsx
│   │   ├── ShareList.tsx
│   │   └── ShareAccess.tsx
│   ├── dashboard/
│   │   ├── StorageChart.tsx
│   │   ├── RecentFiles.tsx
│   │   └── ActivityFeed.tsx
│   └── common/
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── ProgressBar.tsx
│       └── Spinner.tsx
├── services/
│   ├── crypto.service.ts
│   ├── api.service.ts
│   ├── auth.service.ts
│   ├── file.service.ts
│   └── storage.service.ts
├── stores/
│   ├── auth.store.ts
│   ├── file.store.ts
│   └── ui.store.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useFiles.ts
│   └── useEncryption.ts
├── types/
│   └── index.ts
└── utils/
    ├── crypto.ts
    ├── formatting.ts
    └── validation.ts
```

## Backend Architecture

### Technology Stack
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Cache**: Redis
- **Storage**: MinIO (S3-compatible)
- **Authentication**: JWT
- **Validation**: Zod
- **Testing**: Jest + Supertest
- **Logging**: Winston
- **Monitoring**: Prometheus metrics

### Service Structure

```
server/
├── src/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── file.controller.ts
│   │   ├── folder.controller.ts
│   │   └── share.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── file.service.ts
│   │   ├── storage.service.ts
│   │   ├── crypto.service.ts
│   │   └── audit.service.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── rateLimit.middleware.ts
│   │   ├── validation.middleware.ts
│   │   └── error.middleware.ts
│   ├── models/
│   │   └── prisma/
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── file.routes.ts
│   │   ├── folder.routes.ts
│   │   └── share.routes.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── validation.ts
│   │   └── errors.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── storage.ts
│   │   └── redis.ts
│   └── app.ts
├── tests/
│   ├── unit/
│   └── integration/
└── prisma/
    └── schema.prisma
```

## Security Considerations

### Threat Model

1. **Compromised Server**: Even if attacker gains full server access, they cannot decrypt user files
2. **Man-in-the-Middle**: TLS 1.3 prevents eavesdropping on encrypted file data
3. **Malicious Admin**: Server administrators cannot access user data
4. **Brute Force**: PBKDF2 with 100k iterations slows password guessing
5. **Data Breach**: All stored data is encrypted; keys are never stored

### Security Best Practices

1. **Client-Side Encryption**: All encryption/decryption happens in browser
2. **Zero-Knowledge**: Server never sees encryption keys
3. **Key Derivation**: PBKDF2 with high iteration count
4. **Secure Random**: Use crypto.getRandomValues() for all random generation
5. **Input Validation**: Validate and sanitize all inputs
6. **Rate Limiting**: Prevent brute force and DoS attacks
7. **CORS**: Strict CORS policy
8. **CSP**: Content Security Policy headers
9. **Audit Logging**: Log all security-relevant events
10. **Regular Updates**: Keep dependencies updated

## Performance Optimization

### Frontend
- Code splitting by route
- Lazy loading of components
- Virtual scrolling for large file lists
- Web Workers for encryption/decryption
- Service Worker for offline capabilities
- Compression of uploads before encryption

### Backend
- Database connection pooling
- Redis caching for metadata
- CDN for static assets
- Streaming uploads/downloads
- Batch database operations
- Database query optimization with indexes

### Storage
- Multipart uploads for large files
- Deduplication using content hashes
- Compression before encryption (when beneficial)
- CDN for file delivery
- Lifecycle policies for old versions

## Testing Strategy

### Unit Tests
- Crypto functions
- Validation logic
- Service layer functions
- React components

### Integration Tests
- API endpoints
- Database operations
- File upload/download flow
- Authentication flow

### End-to-End Tests
- User registration and login
- File upload and download
- File sharing
- Folder operations

### Security Tests
- Penetration testing
- Vulnerability scanning
- Dependency auditing
- Encryption validation

### Performance Tests
- Load testing (1000+ concurrent users)
- File upload/download speed tests
- API response time tests
- Database query performance

## Deployment

### Docker Compose Setup

```yaml
version: '3.8'

services:
  app:
    build: ./client
    ports:
      - "3000:80"
    depends_on:
      - api

  api:
    build: ./server
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/crypticstorage
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio:9000
    depends_on:
      - db
      - redis
      - minio

  db:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=crypticstorage
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

## Monitoring & Observability

### Metrics
- Request rate and latency
- Error rates
- Storage usage
- Active users
- Upload/download speeds
- Database query performance

### Logging
- Application logs (Winston)
- Access logs
- Error logs
- Audit logs

### Alerts
- High error rate
- Slow response times
- Storage capacity warnings
- Security incidents

## Conclusion

This specification provides a comprehensive technical foundation for building CrypticStorage as a secure, zero-knowledge encrypted file storage platform. The architecture prioritizes security and privacy while maintaining excellent performance and user experience.
