import { Request, Response } from 'express';
import path from 'path';
import * as filesService from './files.service';
import { sendSuccess } from '../../core/utils/response';
import { BadRequestError, ForbiddenError } from '../../core/errors/AppError';
import { uploadFileFieldsSchema } from './files.schemas';

export async function uploadFile(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new BadRequestError('File is required');
  }

  if (!req.actor) {
    throw new ForbiddenError('Authentication required to upload files');
  }

  const fields = uploadFileFieldsSchema.parse({
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    attachmentType: req.body.attachmentType,
    caption: req.body.caption,
  });

  const result = await filesService.uploadFile(
    {
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      declaredMimeType: req.file.mimetype,
      ...fields,
    },
    req.actor,
  );

  sendSuccess(res, result, 201);
}

export async function downloadFile(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError('Authentication required');
  }

  const { file, absolutePath } = await filesService.getFileById(req.params.id!, req.actor);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(file.fileName)}"`);
  res.sendFile(absolutePath);
}

export async function deleteAttachment(req: Request, res: Response): Promise<void> {
  if (!req.actor) {
    throw new ForbiddenError('Authentication required');
  }

  await filesService.deleteAttachment(req.params.attachmentId!, req.actor);
  res.status(204).send();
}
