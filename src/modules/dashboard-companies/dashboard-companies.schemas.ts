import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const companySummarySchema = z
  .object({
    id: z.string().uuid(),
    legalName: z.string(),
    tradeName: z.string().nullable(),
    primaryEmail: z.string().email(),
    primaryPhone: z.string(),
    countryCode: z.string(),
    city: z.string().nullable(),
    status: z.string(),
    approvalStatus: z.string(),
    createdAt: z.string().datetime(),
  })
  .openapi('CompanySummary');

export const listCompaniesQuerySchema = z.object({
  approvalStatus: z
    .enum(['pending', 'under_review', 'approved', 'rejected', 'resubmission_required'])
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const companyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const companyDocumentParamsSchema = z.object({
  id: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

export const decisionBodySchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const verifyDocumentBodySchema = z.object({
  verificationStatus: z.enum(['verified', 'rejected']),
});

export const verifiedDocumentResponseSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    attachmentType: z.string(),
    verificationStatus: z.string().nullable(),
    verifiedBy: z.string().uuid().nullable(),
    verifiedAt: z.string().datetime().nullable(),
    file: z.object({
      id: z.string().uuid(),
      fileName: z.string(),
      mimeType: z.string(),
      url: z.string().nullable(),
    }),
  })
  .openapi('VerifiedDocumentResponse');

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/companies',
  tags: ['Dashboard Companies'],
  summary: 'List companies for dashboard review',
  request: { query: listCompaniesQuerySchema },
  responses: {
    200: {
      description: 'Paginated company list',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(
            z.object({
              items: z.array(companySummarySchema),
              pagination: z.object({
                page: z.number().int(),
                pageSize: z.number().int(),
                totalItems: z.number().int(),
              }),
            }),
          ),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/companies/{id}/approve',
  tags: ['Dashboard Companies'],
  summary: 'Approve a company registration',
  request: {
    params: companyIdParamsSchema,
    body: { content: { 'application/json': { schema: decisionBodySchema } } },
  },
  responses: {
    200: {
      description: 'Company approved',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(companySummarySchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/companies/{id}/reject',
  tags: ['Dashboard Companies'],
  summary: 'Reject a company registration',
  request: {
    params: companyIdParamsSchema,
    body: { content: { 'application/json': { schema: decisionBodySchema } } },
  },
  responses: {
    200: {
      description: 'Company rejected',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(companySummarySchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/companies/{id}/documents/{attachmentId}/verify',
  tags: ['Dashboard Companies'],
  summary: 'Verify or reject a company onboarding document',
  request: {
    params: companyDocumentParamsSchema,
    body: { content: { 'application/json': { schema: verifyDocumentBodySchema } } },
  },
  responses: {
    200: {
      description: 'Document verification updated',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(verifiedDocumentResponseSchema),
        },
      },
    },
  },
});
