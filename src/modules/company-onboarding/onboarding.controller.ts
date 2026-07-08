import { Request, Response } from 'express';
import * as onboardingService from './onboarding.service';
import { sendSuccess } from '../../core/utils/response';
import { BadRequestError, ForbiddenError } from '../../core/errors/AppError';
import { uploadDocumentFieldsSchema } from './onboarding.schemas';

export async function registerCompany(req: Request, res: Response): Promise<void> {
  const result = await onboardingService.registerCompany(req.body);
  sendSuccess(res, result, 201);
}

export async function listAddresses(_req: Request, res: Response): Promise<void> {
  const result = await onboardingService.listAddresses();
  sendSuccess(res, result);
}

export async function createAddress(req: Request, res: Response): Promise<void> {
  const result = await onboardingService.createAddress(req.body);
  sendSuccess(res, result, 201);
}

export async function updateAddress(req: Request, res: Response): Promise<void> {
  const result = await onboardingService.updateAddress(req.params.id!, req.body);
  sendSuccess(res, result);
}

export async function deleteAddress(req: Request, res: Response): Promise<void> {
  await onboardingService.deleteAddress(req.params.id!);
  res.status(204).send();
}

export async function uploadDocument(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new BadRequestError('File is required');
  }
  if (!req.actor) {
    throw new ForbiddenError('Company authentication required');
  }

  const fields = uploadDocumentFieldsSchema.parse({
    attachmentType: req.body.attachmentType,
    caption: req.body.caption,
  });

  const result = await onboardingService.uploadOnboardingDocument(
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
