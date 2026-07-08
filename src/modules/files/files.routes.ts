import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { uploadMiddleware } from '../../core/middleware/upload';
import { validate } from '../../core/middleware/validate';
import { requireAnyAuthMiddleware } from '../../core/middleware/requireAnyAuthMiddleware';
import { attachmentIdParamsSchema, fileIdParamsSchema } from './files.schemas';
import * as controller from './files.controller';

const router = Router();

router.post(
  '/files',
  requireAnyAuthMiddleware,
  uploadMiddleware.single('file'),
  asyncHandler(controller.uploadFile),
);

router.get(
  '/files/:id',
  requireAnyAuthMiddleware,
  validate(fileIdParamsSchema, 'params'),
  asyncHandler(controller.downloadFile),
);

router.delete(
  '/files/attachments/:attachmentId',
  requireAnyAuthMiddleware,
  validate(attachmentIdParamsSchema, 'params'),
  asyncHandler(controller.deleteAttachment),
);

export default router;
