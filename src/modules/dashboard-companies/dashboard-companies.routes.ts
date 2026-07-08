import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import {
  companyDocumentParamsSchema,
  companyIdParamsSchema,
  decisionBodySchema,
  listCompaniesQuerySchema,
  verifyDocumentBodySchema,
} from './dashboard-companies.schemas';
import * as controller from './dashboard-companies.controller';

const router = Router();

router.get(
  '/dashboard/companies',
  dashboardAuthMiddleware,
  validate(listCompaniesQuerySchema, 'query'),
  asyncHandler(controller.listCompanies),
);

router.get(
  '/dashboard/companies/:id',
  dashboardAuthMiddleware,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.getCompany),
);

router.get(
  '/dashboard/companies/:id/documents',
  dashboardAuthMiddleware,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.listCompanyDocuments),
);

router.post(
  '/dashboard/companies/:id/approve',
  dashboardAuthMiddleware,
  validate(companyIdParamsSchema, 'params'),
  validate(decisionBodySchema),
  asyncHandler(controller.approveCompany),
);

router.post(
  '/dashboard/companies/:id/reject',
  dashboardAuthMiddleware,
  validate(companyIdParamsSchema, 'params'),
  validate(decisionBodySchema),
  asyncHandler(controller.rejectCompany),
);

router.patch(
  '/dashboard/companies/:id/documents/:attachmentId/verify',
  dashboardAuthMiddleware,
  validate(companyDocumentParamsSchema, 'params'),
  validate(verifyDocumentBodySchema),
  asyncHandler(controller.verifyDocument),
);

export default router;
