import { Router } from 'express';
import { handler, ok } from '../../lib/http';
import { auth, requireAuth } from '../../middleware/auth';
import { body, query, validate } from '../../middleware/validate';
import * as service from './service';
import { createFolderSchema, idParamSchema, listFoldersQuerySchema, moveFolderSchema, updateFolderSchema } from './schema';

export const foldersRouter = Router();
foldersRouter.use(requireAuth);

foldersRouter.get(
  '/',
  validate('query', listFoldersQuerySchema),
  handler(async (req, res) => ok(res, await service.listFolders(auth(req).userId, query(req, listFoldersQuerySchema).parentId)))
);

foldersRouter.post(
  '/',
  validate('body', createFolderSchema),
  handler(async (req, res) => ok(res, await service.createFolder(auth(req).userId, body(req, createFolderSchema), req), 201))
);

foldersRouter.get(
  '/:id',
  validate('params', idParamSchema),
  handler(async (req, res) => ok(res, await service.getFolder(auth(req).userId, req.params.id!)))
);

foldersRouter.patch(
  '/:id',
  validate('params', idParamSchema),
  validate('body', updateFolderSchema),
  handler(async (req, res) => ok(res, await service.updateFolder(auth(req).userId, req.params.id!, body(req, updateFolderSchema), req)))
);

foldersRouter.post(
  '/:id/move',
  validate('params', idParamSchema),
  validate('body', moveFolderSchema),
  handler(async (req, res) => ok(res, await service.moveFolder(auth(req).userId, req.params.id!, body(req, moveFolderSchema).parentId, req)))
);

foldersRouter.delete(
  '/:id',
  validate('params', idParamSchema),
  handler(async (req, res) => {
    await service.deleteFolder(auth(req).userId, req.params.id!, req);
    ok(res, { deleted: true });
  })
);
