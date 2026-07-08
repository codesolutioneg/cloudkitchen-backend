import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { companyAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { uploadMiddleware } from '../../core/middleware/upload';
import {
  addressBodySchema,
  addressIdParamsSchema,
  registerCompanySchema,
} from './onboarding.schemas';
import * as controller from './onboarding.controller';

const router = Router();

router.post(
  '/company/onboarding/register',
  validate(registerCompanySchema),
  asyncHandler(controller.registerCompany),
);

router.get(
  '/company/onboarding/addresses',
  companyAuthMiddleware,
  asyncHandler(controller.listAddresses),
);

router.post(
  '/company/onboarding/addresses',
  companyAuthMiddleware,
  validate(addressBodySchema),
  asyncHandler(controller.createAddress),
);

router.patch(
  '/company/onboarding/addresses/:id',
  companyAuthMiddleware,
  validate(addressIdParamsSchema, 'params'),
  validate(addressBodySchema.partial()),
  asyncHandler(controller.updateAddress),
);

router.delete(
  '/company/onboarding/addresses/:id',
  companyAuthMiddleware,
  validate(addressIdParamsSchema, 'params'),
  asyncHandler(controller.deleteAddress),
);

router.post(
  '/company/onboarding/documents',
  companyAuthMiddleware,
  uploadMiddleware.single('file'),
  asyncHandler(controller.uploadDocument),
);

export default router;
