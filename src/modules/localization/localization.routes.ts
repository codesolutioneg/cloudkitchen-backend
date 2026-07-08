import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  createLanguageSchema,
  languageCodeParamsSchema,
  listTranslationsQuerySchema,
  updateLanguageSchema,
  upsertTranslationsSchema,
} from './localization.schemas';
import * as controller from './localization.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canViewLocalization = requirePagePermission('/dashboard/localization', 'view');
const canCreateLocalization = requirePagePermission('/dashboard/localization', 'create');
const canEditLocalization = requirePagePermission('/dashboard/localization', 'edit');

router.get(
  '/dashboard/languages',
  dashAuth,
  canViewLocalization,
  asyncHandler(controller.listLanguages),
);

router.post(
  '/dashboard/languages',
  dashAuth,
  canCreateLocalization,
  validate(createLanguageSchema),
  asyncHandler(controller.createLanguage),
);

router.patch(
  '/dashboard/languages/:code',
  dashAuth,
  canEditLocalization,
  validate(languageCodeParamsSchema, 'params'),
  validate(updateLanguageSchema),
  asyncHandler(controller.updateLanguage),
);

router.get(
  '/dashboard/translations',
  dashAuth,
  canViewLocalization,
  validate(listTranslationsQuerySchema, 'query'),
  asyncHandler(controller.listTranslations),
);

router.put(
  '/dashboard/translations',
  dashAuth,
  canEditLocalization,
  validate(upsertTranslationsSchema),
  asyncHandler(controller.upsertTranslations),
);

router.get(
  '/company/languages',
  companyAuthMiddleware,
  asyncHandler(controller.listActiveLanguages),
);

export default router;
