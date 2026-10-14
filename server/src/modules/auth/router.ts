import { Router } from 'express';
import { handler, ok } from '../../lib/http';
import { auth, requireAuth, requireTwoFactorPending } from '../../middleware/auth';
import { body, validate } from '../../middleware/validate';
import { authLimiter } from '../../middleware/rateLimit';
import * as service from './service';
import { loginSchema, refreshSchema, registerSchema, resendVerificationSchema, verifyEmailSchema, verifyTwoFactorSchema } from './schema';

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate('body', registerSchema),
  handler(async (req, res) => ok(res, await service.register(body(req, registerSchema), req), 201))
);

authRouter.post(
  '/login',
  authLimiter,
  validate('body', loginSchema),
  handler(async (req, res) => ok(res, await service.login(body(req, loginSchema), req)))
);

authRouter.post(
  '/verify-email',
  authLimiter,
  validate('body', verifyEmailSchema),
  handler(async (req, res) => ok(res, await service.verifyEmail(body(req, verifyEmailSchema).token, req)))
);

authRouter.post(
  '/resend-verification',
  authLimiter,
  validate('body', resendVerificationSchema),
  handler(async (req, res) => {
    await service.resendVerification(body(req, resendVerificationSchema).email);
    ok(res, {}, 202);
  })
);

authRouter.post(
  '/verify-2fa',
  authLimiter,
  requireTwoFactorPending,
  validate('body', verifyTwoFactorSchema),
  handler(async (req, res) => {
    const ctx = auth(req);
    ok(res, await service.completeTwoFactor(ctx.userId, ctx.sessionId, body(req, verifyTwoFactorSchema), req));
  })
);

authRouter.post(
  '/refresh',
  validate('body', refreshSchema),
  handler(async (req, res) => ok(res, await service.refresh(body(req, refreshSchema).refreshToken, req)))
);

authRouter.post(
  '/logout',
  requireAuth,
  handler(async (req, res) => {
    const ctx = auth(req);
    await service.logout(ctx.sessionId, ctx.userId, req);
    ok(res, { loggedOut: true });
  })
);
