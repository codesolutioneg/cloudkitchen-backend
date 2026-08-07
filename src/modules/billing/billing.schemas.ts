import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';
import { PAYMENT_MODES } from './billing.service';

extendZodWithOpenApi(z);

const money = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Expected a money amount, e.g. "1250.00"');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

export const companyIdParamsSchema = z.object({ companyId: z.string().uuid() });
export const idParamsSchema = z.object({ id: z.string().uuid() });
export const instalmentParamsSchema = z.object({ instalmentId: z.string().uuid() });

export const setTermsSchema = z.object({
  paymentMode: z.enum(PAYMENT_MODES),
  netDays: z.number().int().min(0).max(180).optional(),
  creditLimit: money.optional(),
  currency: z.string().length(3).optional(),
  poReference: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const generateInvoiceSchema = z.object({
  periodStart: isoDate,
  periodEnd: isoDate,
  issue: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export const planInstalmentsSchema = z.object({
  count: z.number().int().min(1).max(24),
  firstDueDate: isoDate,
  everyDays: z.number().int().min(1).max(90).optional(),
  issue: z.boolean().optional(),
});

export const decideInstalmentSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().max(1000).optional(),
});

export const recordPaymentSchema = z.object({ amount: money });

export const instalmentProofSchema = z.object({ proofAttachmentId: z.string().uuid() });

export const listInvoicesQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  status: z.string().max(20).optional(),
});

export const billingTermsSchema = z
  .object({
    companyId: z.string().uuid(),
    paymentMode: z.string(),
    netDays: z.number().int(),
    creditLimit: z.string(),
    currency: z.string(),
    poReference: z.string().nullable(),
    notes: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .openapi('CompanyBillingTerms');

export const invoiceSchema = z
  .object({
    id: z.string().uuid(),
    invoiceNumber: z.string(),
    companyId: z.string().uuid(),
    companyName: z.string().nullable(),
    mealPlanId: z.string().uuid().nullable(),
    status: z.string(),
    source: z.string(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
    issuedAt: z.string().nullable(),
    dueAt: z.string().nullable(),
    subtotalAmount: z.string(),
    taxAmount: z.string(),
    totalAmount: z.string(),
    paidAmount: z.string(),
    outstandingAmount: z.string(),
    currency: z.string(),
    poReference: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    lines: z.array(
      z.object({
        id: z.string().uuid(),
        orderId: z.string().uuid().nullable(),
        description: z.string(),
        quantity: z.number().int(),
        unitAmount: z.string(),
        lineTotal: z.string(),
      }),
    ),
    instalments: z.array(
      z.object({
        id: z.string().uuid(),
        sequence: z.number().int(),
        dueAt: z.string(),
        amount: z.string(),
        status: z.string(),
        paidAt: z.string().nullable(),
        rejectionReason: z.string().nullable(),
      }),
    ),
  })
  .openapi('Invoice');

export const billingSummarySchema = z
  .object({
    terms: billingTermsSchema,
    openInvoiceCount: z.number().int(),
    outstandingAmount: z.string(),
    overdueAmount: z.string(),
    creditRemaining: z.string().nullable(),
    nextInstalment: z
      .object({
        id: z.string().uuid(),
        invoiceId: z.string().uuid(),
        invoiceNumber: z.string(),
        sequence: z.number().int(),
        dueAt: z.string(),
        amount: z.string(),
        currency: z.string(),
        status: z.string(),
      })
      .nullable(),
  })
  .openapi('BillingSummary');

const dash = [{ dashboardBearerAuth: [] }];
const company = [{ companyBearerAuth: [] }];
const TAG = ['Billing'];

function ok(description: string, schema: z.ZodTypeAny) {
  return { 200: { description, content: { 'application/json': { schema: SuccessEnvelopeSchema(schema) } } } };
}

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/companies/{companyId}/billing-terms',
  tags: TAG,
  summary: 'Get a company billing terms',
  security: dash,
  request: { params: companyIdParamsSchema },
  responses: ok('Billing terms', billingTermsSchema),
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/dashboard/companies/{companyId}/billing-terms',
  tags: TAG,
  summary: 'Set a company billing terms',
  security: dash,
  request: {
    params: companyIdParamsSchema,
    body: { content: { 'application/json': { schema: setTermsSchema } } },
  },
  responses: ok('Billing terms saved', billingTermsSchema),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/companies/{companyId}/invoices',
  tags: TAG,
  summary: 'Consolidate a period of orders into one invoice',
  security: dash,
  request: {
    params: companyIdParamsSchema,
    body: { content: { 'application/json': { schema: generateInvoiceSchema } } },
  },
  responses: { 201: { description: 'Invoice created' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/invoices',
  tags: TAG,
  summary: 'List invoices',
  security: dash,
  request: { query: listInvoicesQuerySchema },
  responses: ok('Invoices', z.array(invoiceSchema)),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/invoices/{id}',
  tags: TAG,
  summary: 'Get an invoice',
  security: dash,
  request: { params: idParamsSchema },
  responses: ok('Invoice', invoiceSchema),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/invoices/{id}/payments',
  tags: TAG,
  summary: 'Record a payment against an invoice',
  security: dash,
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: recordPaymentSchema } } },
  },
  responses: ok('Invoice updated', invoiceSchema),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/meal-plans/{id}/instalments',
  tags: TAG,
  summary: 'Split a confirmed plan into instalments',
  security: dash,
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: planInstalmentsSchema } } },
  },
  responses: { 201: { description: 'Instalment invoice created' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/instalments/{instalmentId}/decide',
  tags: TAG,
  summary: 'Approve or reject an instalment payment',
  security: dash,
  request: {
    params: instalmentParamsSchema,
    body: { content: { 'application/json': { schema: decideInstalmentSchema } } },
  },
  responses: ok('Invoice updated', invoiceSchema),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/billing/mark-overdue',
  tags: TAG,
  summary: 'Mark invoices and instalments past due as overdue',
  security: dash,
  responses: { 200: { description: 'Counts of rows marked' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/billing/summary',
  tags: TAG,
  summary: 'What my company owes',
  security: company,
  responses: ok('Billing summary', billingSummarySchema),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/billing/terms',
  tags: TAG,
  summary: 'My company payment terms',
  security: company,
  responses: ok('Billing terms', billingTermsSchema),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/invoices',
  tags: TAG,
  summary: 'My company invoices',
  security: company,
  responses: ok('Invoices', z.array(invoiceSchema)),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/invoices/{id}',
  tags: TAG,
  summary: 'Get one of my invoices',
  security: company,
  request: { params: idParamsSchema },
  responses: ok('Invoice', invoiceSchema),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/instalments/{instalmentId}/proof',
  tags: TAG,
  summary: 'Attach payment proof to an instalment',
  security: company,
  request: {
    params: instalmentParamsSchema,
    body: { content: { 'application/json': { schema: instalmentProofSchema } } },
  },
  responses: ok('Invoice updated', invoiceSchema),
});
