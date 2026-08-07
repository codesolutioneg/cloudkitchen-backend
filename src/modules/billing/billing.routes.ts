import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  companyIdParamsSchema,
  decideInstalmentSchema,
  generateInvoiceSchema,
  idParamsSchema,
  instalmentParamsSchema,
  instalmentProofSchema,
  listInvoicesQuerySchema,
  planInstalmentsSchema,
  recordPaymentSchema,
  setTermsSchema,
} from './billing.schemas';
import * as controller from './billing.controller';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const companyAuth = companyAuthMiddleware;
const canView = requirePagePermission('/dashboard/billing', 'view');
const canEdit = requirePagePermission('/dashboard/billing', 'edit');
const canApprove = requirePagePermission('/dashboard/billing', 'approve');

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get(
  '/dashboard/companies/:companyId/billing-terms',
  dashAuth,
  canView,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.getCompanyTerms),
);
router.put(
  '/dashboard/companies/:companyId/billing-terms',
  dashAuth,
  canEdit,
  validate(companyIdParamsSchema, 'params'),
  validate(setTermsSchema),
  asyncHandler(controller.setCompanyTerms),
);
router.post(
  '/dashboard/companies/:companyId/invoices',
  dashAuth,
  canEdit,
  validate(companyIdParamsSchema, 'params'),
  validate(generateInvoiceSchema),
  asyncHandler(controller.generateInvoice),
);

router.get(
  '/dashboard/invoices',
  dashAuth,
  canView,
  validate(listInvoicesQuerySchema, 'query'),
  asyncHandler(controller.listInvoices),
);
router.get(
  '/dashboard/invoices/:id',
  dashAuth,
  canView,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getInvoice),
);
router.post(
  '/dashboard/invoices/:id/payments',
  dashAuth,
  canApprove,
  validate(idParamsSchema, 'params'),
  validate(recordPaymentSchema),
  asyncHandler(controller.recordInvoicePayment),
);

router.post(
  '/dashboard/meal-plans/:id/instalments',
  dashAuth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(planInstalmentsSchema),
  asyncHandler(controller.createPlanInstalments),
);
router.post(
  '/dashboard/instalments/:instalmentId/decide',
  dashAuth,
  canApprove,
  validate(instalmentParamsSchema, 'params'),
  validate(decideInstalmentSchema),
  asyncHandler(controller.decideInstalment),
);
router.post('/dashboard/billing/mark-overdue', dashAuth, canEdit, asyncHandler(controller.markOverdue));

// ── Company ───────────────────────────────────────────────────────────────────

router.get('/company/billing/summary', companyAuth, asyncHandler(controller.getMyBillingSummary));
router.get('/company/billing/terms', companyAuth, asyncHandler(controller.getMyTerms));
router.get('/company/invoices', companyAuth, asyncHandler(controller.listMyInvoices));
router.get(
  '/company/invoices/:id',
  companyAuth,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getMyInvoice),
);
router.post(
  '/company/instalments/:instalmentId/proof',
  companyAuth,
  validate(instalmentParamsSchema, 'params'),
  validate(instalmentProofSchema),
  asyncHandler(controller.submitInstalmentProof),
);

export default router;
