import { Router } from 'express';
import { handler, ok } from '../../lib/http';
import { auth, requireAuth } from '../../middleware/auth';
import { body, validate } from '../../middleware/validate';
import * as service from './service';
import { inviteSchema, thresholdSchema } from './schema';

export const witnessesRouter = Router();
witnessesRouter.use(requireAuth);

witnessesRouter.get('/', handler(async (req, res) => ok(res, await service.getSet(auth(req).userId))));

witnessesRouter.put(
  '/threshold',
  validate('body', thresholdSchema),
  handler(async (req, res) => ok(res, await service.setThreshold(auth(req).userId, body(req, thresholdSchema).k, req)))
);

witnessesRouter.post(
  '/',
  validate('body', inviteSchema),
  handler(async (req, res) => ok(res, await service.invite(auth(req).userId, body(req, inviteSchema).email, req), 201))
);

// Declared before "/:id" so "invitations" is never read as an id.
witnessesRouter.get('/invitations', handler(async (req, res) => ok(res, await service.myInvitations(auth(req).userId))));

witnessesRouter.post(
  '/invitations/:id/accept',
  handler(async (req, res) => ok(res, await service.respond(auth(req).userId, String(req.params.id), 'accepted', req)))
);

witnessesRouter.post(
  '/invitations/:id/decline',
  handler(async (req, res) => ok(res, await service.respond(auth(req).userId, String(req.params.id), 'declined', req)))
);

witnessesRouter.post('/:id/resend', handler(async (req, res) => ok(res, await service.resend(auth(req).userId, String(req.params.id), req))));

witnessesRouter.delete('/:id', handler(async (req, res) => ok(res, await service.remove(auth(req).userId, String(req.params.id), req))));
