import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const attachmentTypeSchema = z.enum([
  'trade_license',
  'commercial_registration',
  'tax_certificate',
  'logo',
  'authorization_letter',
  'bank_letter',
  'other',
]);

export const entityTypeSchema = z.enum([
  'company',
  'product',
  'order',
  'invoice',
  'category',
  'dashboard_user',
]);

const FileAttachmentSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  attachmentType: z.string(),
});

export const FileResponseSchema = z
  .object({
    id: z.string().uuid(),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    url: z.string().nullable(),
    storageProvider: z.string(),
    uploadedByType: z.string(),
    uploadedById: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    attachments: z.array(FileAttachmentSchema),
  })
  .openapi('FileResponse');

export const uploadFileFieldsSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  attachmentType: attachmentTypeSchema,
  caption: z.string().max(255).optional(),
});

export const fileIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const attachmentIdParamsSchema = z.object({
  attachmentId: z.string().uuid(),
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/files',
  tags: ['Files'],
  summary: 'Upload a file and create an attachment',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ format: 'binary' }),
            entityType: entityTypeSchema,
            entityId: z.string().uuid(),
            attachmentType: attachmentTypeSchema,
            caption: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'File uploaded',
      content: { 'application/json': { schema: SuccessEnvelopeSchema(FileResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/files/{id}',
  tags: ['Files'],
  summary: 'Download a file by id',
  request: { params: fileIdParamsSchema },
  responses: {
    200: { description: 'File stream' },
    404: { description: 'Not found' },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/files/attachments/{attachmentId}',
  tags: ['Files'],
  summary: 'Delete a file attachment',
  request: { params: attachmentIdParamsSchema },
  responses: {
    204: { description: 'Deleted' },
  },
});
