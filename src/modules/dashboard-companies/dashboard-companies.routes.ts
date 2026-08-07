import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  companyDocumentParamsSchema,
  companyIdParamsSchema,
  decisionBodySchema,
  listCompaniesQuerySchema,
  verifyDocumentBodySchema,
} from './dashboard-companies.schemas';
import * as controller from './dashboard-companies.controller';

const router = Router();
const canViewCompanies = requirePagePermission('/dashboard/companies', 'view');
const canApproveCompanies = requirePagePermission('/dashboard/companies', 'approve');
const canEditCompanies = requirePagePermission('/dashboard/companies', 'edit');

router.get(
  '/dashboard/companies',
  dashboardAuthMiddleware,
  canViewCompanies,
  validate(listCompaniesQuerySchema, 'query'),
  asyncHandler(controller.listCompanies),
);

router.get(
  '/dashboard/companies/:id',
  dashboardAuthMiddleware,
  canViewCompanies,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.getCompany),
);

router.get(
  '/dashboard/companies/:id/documents',
  dashboardAuthMiddleware,
  canViewCompanies,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.listCompanyDocuments),
);

router.post(
  '/dashboard/companies/:id/approve',
  dashboardAuthMiddleware,
  canApproveCompanies,
  validate(companyIdParamsSchema, 'params'),
  validate(decisionBodySchema),
  asyncHandler(controller.approveCompany),
);

router.post(
  '/dashboard/companies/:id/reject',
  dashboardAuthMiddleware,
  canApproveCompanies,
  validate(companyIdParamsSchema, 'params'),
  validate(decisionBodySchema),
  asyncHandler(controller.rejectCompany),
);

router.patch(
  '/dashboard/companies/:id/documents/:attachmentId/verify',
  dashboardAuthMiddleware,
  canEditCompanies,
  validate(companyDocumentParamsSchema, 'params'),
  validate(verifyDocumentBodySchema),
  asyncHandler(controller.verifyDocument),
);

export default router;
