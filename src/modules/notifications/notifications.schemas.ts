import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const notificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'read']).optional(),
});

export const registerDeviceTokenSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  token: z.string().min(1).max(500),
});

export const deviceTokenIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createNotificationTemplateSchema = z.object({
  code: z.string().min(1).max(100),
  channel: z.enum(['email', 'sms', 'push', 'in_app', 'system']),
  subjectTemplate: z.string().optional(),
  bodyTemplate: z.string().min(1),
  languageCode: z.string().min(2).max(10),
});

export const updateNotificationTemplateSchema = z.object({
  subjectTemplate: z.string().optional().nullable(),
  bodyTemplate: z.string().min(1).optional(),
});

export const templateIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const notificationSchema = z
  .object({
    id: z.string().uuid(),
    channel: z.string(),
    subject: z.string().nullable(),
    body: z.string(),
    status: z.string(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('Notification');

const deviceTokenSchema = z
  .object({
    id: z.string().uuid(),
    platform: z.string(),
    token: z.string(),
    isActive: z.boolean(),
  })
  .openapi('DeviceToken');

const notificationTemplateSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    channel: z.string(),
    languageCode: z.string(),
    bodyTemplate: z.string(),
  })
  .openapi('NotificationTemplate');

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/notifications',
  tags: ['Notifications'],
  summary: 'List notifications for caller',
  security: [{ companyBearerAuth: [] }],
  request: { query: listNotificationsQuerySchema },
  responses: {
    200: {
      description: 'Paginated notification list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(notificationSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/notifications/{id}/read',
  tags: ['Notifications'],
  summary: 'Mark notification as read',
  security: [{ companyBearerAuth: [] }],
  request: { params: notificationIdParamsSchema },
  responses: {
    200: {
      description: 'Notification marked read',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(notificationSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/device-tokens',
  tags: ['Notifications'],
  summary: 'Register FCM device token',
  security: [{ companyBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: registerDeviceTokenSchema } } } },
  responses: {
    201: {
      description: 'Device token registered',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(deviceTokenSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/company/device-tokens/{id}',
  tags: ['Notifications'],
  summary: 'Deactivate device token',
  security: [{ companyBearerAuth: [] }],
  request: { params: deviceTokenIdParamsSchema },
  responses: { 204: { description: 'Device token removed' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/notification-templates',
  tags: ['Notifications'],
  summary: 'List notification templates',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Notification template list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(notificationTemplateSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/notification-templates',
  tags: ['Notifications'],
  summary: 'Create notification template',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createNotificationTemplateSchema } } },
  },
  responses: {
    201: {
      description: 'Template created',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(notificationTemplateSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/dashboard/notification-templates/{id}',
  tags: ['Notifications'],
  summary: 'Update notification template',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: templateIdParamsSchema,
    body: { content: { 'application/json': { schema: updateNotificationTemplateSchema } } },
  },
  responses: {
    200: {
      description: 'Template updated',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(notificationTemplateSchema) },
      },
    },
  },
});
