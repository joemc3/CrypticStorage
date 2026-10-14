import { Router } from 'express';
import { pipeline } from 'stream/promises';
import { handler, ok } from '../../lib/http';
import { auth, requireAuth } from '../../middleware/auth';
import { body, query, validate } from '../../middleware/validate';
import { verifyContentToken } from '../../lib/jwt';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import * as service from './service';
import * as shares from '../shares/service';
import { contentTokenQuerySchema, createUploadSchema, idParamSchema, listFilesQuerySchema, moveFileSchema, updateFileSchema } from './schema';

/**
 * Content routes are authenticated by short-lived content tokens instead of the
 * session, because browsers PUT/GET raw bytes to these URLs without headers.
 */
export const fileContentRouter = Router();

fileContentRouter.put(
  '/:id/content',
  validate('params', idParamSchema),
  validate('query', contentTokenQuerySchema),
  handler(async (req, res) => {
    const token = verifyContentToken(query(req, contentTokenQuerySchema).token, 'upload');
    if (token.fid !== req.params.id) throw new NotFoundError('Upload not found');
    const lengthHeader = req.headers['content-length'];
    const declared = lengthHeader !== undefined ? Number(lengthHeader) : undefined;
    if (declared !== undefined && !Number.isFinite(declared)) throw new BadRequestError('Invalid Content-Length');
    await service.receiveContent(token.fid, token.sub, req, declared);
    res.status(204).end();
  })
);

fileContentRouter.get(
  '/:id/content',
  validate('params', idParamSchema),
  validate('query', contentTokenQuerySchema),
  handler(async (req, res) => {
    const token = verifyContentToken(query(req, contentTokenQuerySchema).token, 'download');
    if (token.fid !== req.params.id) throw new NotFoundError('File not found');
    if (token.lid) await shares.recordLinkDownload(token.lid);
    const { stream, size } = await service.openContent(token.fid);
    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(stream, res);
  })
);

export const filesRouter = Router();
filesRouter.use(requireAuth);

filesRouter.get(
  '/',
  validate('query', listFilesQuerySchema),
  handler(async (req, res) => ok(res, await service.listFiles(auth(req).userId, query(req, listFilesQuerySchema).folderId)))
);

filesRouter.post(
  '/upload-url',
  validate('body', createUploadSchema),
  handler(async (req, res) => ok(res, await service.createUpload(auth(req).userId, body(req, createUploadSchema), req), 201))
);

filesRouter.post(
  '/:id/confirm',
  validate('params', idParamSchema),
  handler(async (req, res) => ok(res, await service.confirmUpload(auth(req).userId, req.params.id!, req)))
);

filesRouter.get(
  '/:id',
  validate('params', idParamSchema),
  handler(async (req, res) => ok(res, await service.getFile(auth(req).userId, req.params.id!)))
);

filesRouter.get(
  '/:id/download-url',
  validate('params', idParamSchema),
  handler(async (req, res) => ok(res, await service.downloadUrl(auth(req).userId, req.params.id!)))
);

filesRouter.patch(
  '/:id',
  validate('params', idParamSchema),
  validate('body', updateFileSchema),
  handler(async (req, res) => ok(res, await service.updateFile(auth(req).userId, req.params.id!, body(req, updateFileSchema), req)))
);

filesRouter.post(
  '/:id/move',
  validate('params', idParamSchema),
  validate('body', moveFileSchema),
  handler(async (req, res) => ok(res, await service.moveFile(auth(req).userId, req.params.id!, body(req, moveFileSchema).folderId, req)))
);

filesRouter.post(
  '/:id/copy',
  validate('params', idParamSchema),
  validate('body', moveFileSchema),
  handler(async (req, res) => ok(res, await service.copyFile(auth(req).userId, req.params.id!, body(req, moveFileSchema).folderId, req), 201))
);

filesRouter.delete(
  '/:id',
  validate('params', idParamSchema),
  handler(async (req, res) => {
    await service.deleteFile(auth(req).userId, req.params.id!, req);
    ok(res, { deleted: true });
  })
);

filesRouter.get(
  '/:id/shares',
  validate('params', idParamSchema),
  handler(async (req, res) => ok(res, await shares.listFileShares(auth(req).userId, req.params.id!)))
);

filesRouter.get(
  '/:id/links',
  validate('params', idParamSchema),
  handler(async (req, res) => ok(res, await shares.listFileLinks(auth(req).userId, req.params.id!)))
);
