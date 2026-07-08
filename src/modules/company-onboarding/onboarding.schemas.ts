import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';
import { attachmentTypeSchema, FileResponseSchema } from '../files/files.schemas';

extendZodWithOpenApi(z);

export const registerCompanySchema = z
  .object({
    legalName: z.string().min(1).max(255),
    tradeName: z.string().max(255).optional(),
    commercialRegistrationNo: z.string().max(100).optional(),
    taxRegistrationNo: z.string().max(100).optional(),
    nationalAddressNo: z.string().max(100).optional(),
    industrySector: z.string().max(150).optional(),
    companySize: z.string().max(50).optional(),
    countryCode: z.string().length(2),
    city: z.string().max(100).optional(),
    primaryContactName: z.string().min(1).max(150),
    primaryContactTitle: z.string().max(100).optional(),
    primaryEmail: z.string().email().max(255),
    primaryPhone: z.string().min(1).max(30),
    secondaryPhone: z.string().max(30).optional(),
    website: z.string().url().max(255).optional(),
    defaultCurrency: z.string().length(3).optional(),
    defaultTimezone: z.string().max(64).optional(),
    defaultLanguageCode: z.string().max(10).optional(),
    userFullName: z.string().min(1).max(150),
    userEmail: z.string().email().max(255),
    userMobile: z.string().max(30).optional(),
    password: z.string().min(8).max(128),
  })
  .openapi('RegisterCompanyRequest');

export const registerCompanyResponseSchema = z
  .object({
    companyId: z.string().uuid(),
    companyUserId: z.string().uuid(),
    legalName: z.string(),
    approvalStatus: z.string(),
    userEmail: z.string().email(),
  })
  .openapi('RegisterCompanyResponse');

export const addressBodySchema = z.object({
  addressType: z.enum(['billing', 'delivery']),
  label: z.string().max(100).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  stateProvince: z.string().max(100).optional(),
  countryCode: z.string().length(2).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  contactName: z.string().max(150).optional(),
  contactPhone: z.string().max(30).optional(),
  isDefault: z.boolean().optional(),
});

export const addressResponseSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    addressType: z.string(),
    label: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    city: z.string().nullable(),
    stateProvince: z.string().nullable(),
    countryCode: z.string().nullable(),
    postalCode: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    contactName: z.string().nullable(),
    contactPhone: z.string().nullable(),
    isDefault: z.boolean(),
    version: z.number().int(),
  })
  .openapi('CompanyAddressResponse');

export const addressIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const uploadDocumentFieldsSchema = z.object({
  attachmentType: attachmentTypeSchema,
  caption: z.string().max(255).optional(),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/onboarding/register',
  tags: ['Company Onboarding'],
  summary: 'Self-register a company and primary contact user',
  request: {
    body: { content: { 'application/json': { schema: registerCompanySchema } } },
  },
  responses: {
    201: {
      description: 'Company registered',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(registerCompanyResponseSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/onboarding/addresses',
  tags: ['Company Onboarding'],
  summary: 'List company addresses',
  responses: {
    200: {
      description: 'Address list',
      content: {
        'application/json': {
          schema: SuccessEnvelopeSchema(z.array(addressResponseSchema)),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/onboarding/addresses',
  tags: ['Company Onboarding'],
  summary: 'Create a company address',
  request: {
    body: { content: { 'application/json': { schema: addressBodySchema } } },
  },
  responses: {
    201: {
      description: 'Address created',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(addressResponseSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/company/onboarding/addresses/{id}',
  tags: ['Company Onboarding'],
  summary: 'Update a company address',
  request: {
    params: addressIdParamsSchema,
    body: { content: { 'application/json': { schema: addressBodySchema.partial() } } },
  },
  responses: {
    200: {
      description: 'Address updated',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(addressResponseSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/company/onboarding/addresses/{id}',
  tags: ['Company Onboarding'],
  summary: 'Soft-delete a company address',
  request: { params: addressIdParamsSchema },
  responses: {
    204: { description: 'Deleted' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/onboarding/documents',
  tags: ['Company Onboarding'],
  summary: 'Upload an onboarding document for the caller company',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ format: 'binary' }),
            attachmentType: attachmentTypeSchema,
            caption: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Document uploaded',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(FileResponseSchema) },
      },
    },
  },
});
