import { Router } from 'express';
import { handler, ok } from '../../lib/http';
import { auth, requireAuth } from '../../middleware/auth';
import { body, validate } from '../../middleware/validate';
import { publicShareLimiter } from '../../middleware/rateLimit';
import * as service from './service';
import { createLinkSchema, createUserShareSchema, idParamSchema, linkPasswordSchema, tokenParamSchema } from './schema';

export const sharesRouter = Router();

// --- Public (no session) ---------------------------------------------------

sharesRouter.get(
  '/public/:token',
  publicShareLimiter,
  validate('params', tokenParamSchema),
  handler(async (req, res) => ok(res, await service.publicLinkInfo(req.params.token!)))
);

sharesRouter.post(
  '/public/:token/download-url',
  publicShareLimiter,
  validate('params', tokenParamSchema),
  validate('body', linkPasswordSchema),
  handler(async (req, res) => ok(res, await service.publicLinkDownloadUrl(req.params.token!, body(req, linkPasswordSchema).password, req)))
);

// --- Authenticated -----------------------------------------------------------

sharesRouter.use(requireAuth);

sharesRouter.post(
  '/',
  validate('body', createUserShareSchema),
  handler(async (req, res) => ok(res, await service.createUserShare(auth(req).userId, body(req, createUserShareSchema), req), 201))
);

sharesRouter.get('/with-me', handler(async (req, res) => ok(res, await service.sharedWithMe(auth(req).userId))));

sharesRouter.post(
  '/links',
  validate('body', createLinkSchema),
  handler(async (req, res) => ok(res, await service.createLink(auth(req).userId, body(req, createLinkSchema), req), 201))
);

sharesRouter.get('/links', handler(async (req, res) => ok(res, await service.listMyLinks(auth(req).userId))));

sharesRouter.delete(
  '/links/:id',
  validate('params', idParamSchema),
  handler(async (req, res) => {
    await service.revokeLink(auth(req).userId, req.params.id!, req);
    ok(res, { revoked: true });
  })
);

sharesRouter.delete(
  '/:id',
  validate('params', idParamSchema),
  handler(async (req, res) => {
    await service.revokeUserShare(auth(req).userId, req.params.id!, req);
    ok(res, { revoked: true });
  })
);
