import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import fileRoutes from './file.routes';
import folderRoutes from './folder.routes';
import shareRoutes from './share.routes';
import userRoutes from './user.routes';

const router = Router();

/**
 * Health check endpoint
 * @route GET /api/health
 * @access Public
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'CrypticStorage API is running',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0',
  });
});

/**
 * API Information endpoint
 * @route GET /api
 * @access Public
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Welcome to CrypticStorage API',
    version: process.env.API_VERSION || '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        refresh: 'POST /api/auth/refresh',
        enable2FA: 'POST /api/auth/2fa/enable',
        verify2FA: 'POST /api/auth/2fa/verify',
        disable2FA: 'POST /api/auth/2fa/disable',
      },
      files: {
        upload: 'POST /api/files',
        list: 'GET /api/files',
        get: 'GET /api/files/:id',
        download: 'GET /api/files/:id/download',
        update: 'PUT /api/files/:id',
        delete: 'DELETE /api/files/:id',
      },
      folders: {
        create: 'POST /api/folders',
        list: 'GET /api/folders',
        get: 'GET /api/folders/:id',
        update: 'PUT /api/folders/:id',
        delete: 'DELETE /api/folders/:id',
      },
      shares: {
        create: 'POST /api/shares',
        list: 'GET /api/shares',
        revoke: 'DELETE /api/shares/:id',
        getPublic: 'GET /api/shares/public/:token',
        downloadPublic: 'GET /api/shares/public/:token/download',
      },
      users: {
        getProfile: 'GET /api/users/profile',
        updateProfile: 'PUT /api/users/profile',
        getStorageStats: 'GET /api/users/storage/stats',
        getActivity: 'GET /api/users/activity',
      },
    },
    documentation: process.env.API_DOCS_URL || 'https://docs.crypticstorage.com',
  });
});

/**
 * Mount route modules
 */
router.use('/auth', authRoutes);
router.use('/files', fileRoutes);
router.use('/folders', folderRoutes);
router.use('/shares', shareRoutes);
router.use('/users', userRoutes);

export default router;
