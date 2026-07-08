import { Request, Response } from 'express';
import * as service from './localization.service';
import { sendSuccess } from '../../core/utils/response';

export async function listLanguages(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listLanguages());
}

export async function createLanguage(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.createLanguage(req.body), 201);
}

export async function updateLanguage(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.updateLanguage(req.params.code!, req.body));
}

export async function listTranslations(req: Request, res: Response): Promise<void> {
  sendSuccess(
    res,
    await service.listTranslations({
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
      languageCode: req.query.languageCode as string | undefined,
    }),
  );
}

export async function upsertTranslations(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.upsertTranslations(req.body.translations));
}

export async function listActiveLanguages(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, await service.listActiveLanguages());
}
