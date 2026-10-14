import { Router } from 'express';
import { handler, ok } from '../../lib/http';
import { auth, requireAuth } from '../../middleware/auth';
import { body, validate } from '../../middleware/validate';
import * as service from './service';
import * as requests from './requests';
import { addItemsSchema, createRuleSchema, openRequestSchema, replaceSharesSchema, ruleIdParamSchema, voteSchema } from './schema';

export const handoffRouter = Router();
handoffRouter.use(requireAuth);

handoffRouter.get('/rules', handler(async (req, res) => ok(res, await service.listRules(auth(req).userId))));

handoffRouter.post(
  '/rules',
  validate('body', createRuleSchema),
  handler(async (req, res) => ok(res, await service.createRule(auth(req).userId, body(req, createRuleSchema), req), 201))
);

handoffRouter.get(
  '/rules/:id',
  validate('params', ruleIdParamSchema),
  handler(async (req, res) => ok(res, await service.getRule(auth(req).userId, req.params.id!)))
);

handoffRouter.delete(
  '/rules/:id',
  validate('params', ruleIdParamSchema),
  handler(async (req, res) => ok(res, await service.revokeRule(auth(req).userId, req.params.id!, req)))
);

handoffRouter.put(
  '/rules/:id/shares',
  validate('params', ruleIdParamSchema),
  validate('body', replaceSharesSchema),
  handler(async (req, res) => ok(res, await service.replaceShares(auth(req).userId, req.params.id!, body(req, replaceSharesSchema).shares, req)))
);

handoffRouter.put(
  '/rules/:id/items',
  validate('params', ruleIdParamSchema),
  validate('body', addItemsSchema),
  handler(async (req, res) => ok(res, await service.addItems(auth(req).userId, req.params.id!, body(req, addItemsSchema).items, req)))
);

handoffRouter.get('/for-me', handler(async (req, res) => ok(res, await service.forMe(auth(req).userId))));

handoffRouter.get('/requests', handler(async (req, res) => ok(res, await requests.listRequests(auth(req).userId))));

handoffRouter.post(
  '/requests',
  validate('body', openRequestSchema),
  handler(async (req, res) => ok(res, await requests.openRequest(auth(req).userId, body(req, openRequestSchema).ownerId, req), 201))
);

handoffRouter.post(
  '/requests/:id/votes',
  validate('params', ruleIdParamSchema),
  validate('body', voteSchema),
  handler(async (req, res) => ok(res, await requests.vote(auth(req).userId, req.params.id!, body(req, voteSchema).shares, req), 201))
);
