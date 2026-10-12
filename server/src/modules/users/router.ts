import { Router } from 'express';
import { handler, ok } from '../../lib/http';
import { auth, requireAuth } from '../../middleware/auth';
import { body, query, validate } from '../../middleware/validate';
import { authLimiter } from '../../middleware/rateLimit';
import * as service from './service';
import {
  activityQuerySchema,
  disableTwoFactorSchema,
  passwordConfirmSchema,
  publicKeyQuerySchema,
  totpTokenSchema,
  updateProfileSchema,
} from './schema';

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get('/profile', handler(async (req, res) => ok(res, await service.getProfile(auth(req).userId))));

usersRouter.patch(
  '/profile',
  authLimiter,
  validate('body', updateProfileSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    ok(res, await service.updateProfile(ctx.userId, ctx.sessionId, body(req, updateProfileSchema), req));
  })
);

usersRouter.delete(
  '/profile',
  authLimiter,
  validate('body', passwordConfirmSchema),
  handler(async (req, res) => {
    await service.deleteAccount(auth(req).userId, body(req, passwordConfirmSchema).passwordHash, req);
    ok(res, { deleted: true });
  })
);

usersRouter.get(
  '/public-key',
  validate('query', publicKeyQuerySchema),
  handler(async (req, res) => ok(res, await service.publicKeyForEmail(query(req, publicKeyQuerySchema).email)))
);

usersRouter.post('/2fa/setup', handler(async (req, res) => ok(res, await service.setupTwoFactor(auth(req).userId))));

usersRouter.post(
  '/2fa/enable',
  authLimiter,
  validate('body', totpTokenSchema),
  handler(async (req, res) => ok(res, await service.enableTwoFactor(auth(req).userId, body(req, totpTokenSchema).token, req)))
);

usersRouter.post(
  '/2fa/disable',
  authLimiter,
  validate('body', disableTwoFactorSchema),
  handler(async (req, res) => {
    const input = body(req, disableTwoFactorSchema);
    await service.disableTwoFactor(auth(req).userId, input.token, input.passwordHash, req);
    ok(res, { disabled: true });
  })
);

usersRouter.post(
  '/2fa/backup-codes',
  authLimiter,
  validate('body', passwordConfirmSchema),
  handler(async (req, res) =>
    ok(res, await service.regenerateBackupCodes(auth(req).userId, body(req, passwordConfirmSchema).passwordHash, req))
  )
);

/** Mounted at /storage and /activity to match the client. */
export const storageRouter = Router();
storageRouter.use(requireAuth);
storageRouter.get('/stats', handler(async (req, res) => ok(res, await service.storageStats(auth(req).userId))));

export const activityRouter = Router();
activityRouter.use(requireAuth);
activityRouter.get(
  '/',
  validate('query', activityQuerySchema),
  handler(async (req, res) => {
    const q = query(req, activityQuerySchema);
    ok(res, await service.activity(auth(req).userId, q.page, q.pageSize));
  })
);
