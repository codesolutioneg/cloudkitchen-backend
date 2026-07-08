import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const approvalLevelParamsSchema = z.object({
  id: z.string().uuid(),
  level: z.coerce.number().int().positive(),
});

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  options: z.array(z.object({ productOptionId: z.string().uuid() })).optional(),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1),
  requestedDeliveryAt: z.string().datetime(),
  fulfillmentType: z.enum(['delivery', 'pickup']),
  deliveryAddressId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  sourceChannel: z.string().max(20).optional(),
  isBulkOrder: z.boolean().optional(),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const listDashboardOrdersQuerySchema = listOrdersQuerySchema.extend({
  companyId: z.string().uuid().optional(),
  statusCode: z.string().optional(),
});

export const cancelOrderSchema = z.object({
  reasonText: z.string().optional(),
});

export const addOrderNoteSchema = z.object({
  note: z.string().min(1),
});

export const addDashboardOrderNoteSchema = addOrderNoteSchema.extend({
  isInternal: z.boolean().optional(),
});

export const transitionOrderSchema = z.object({
  toStepId: z.string().uuid(),
  comment: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export const decideOrderApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});

const orderSummarySchema = z
  .object({
    id: z.string().uuid(),
    orderNumber: z.string(),
    companyId: z.string().uuid(),
    currency: z.string(),
    totalAmount: z.string(),
    requestedDeliveryAt: z.string(),
    fulfillmentType: z.string(),
    createdAt: z.string(),
    currentStepCode: z.string().nullable(),
    currentStepName: z.string().nullable(),
  })
  .openapi('OrderSummary');

const orderDetailSchema = orderSummarySchema
  .extend({
    departmentId: z.string().uuid().nullable(),
    orderedByUserId: z.string().uuid(),
    workflowInstanceId: z.string().uuid().nullable(),
    subtotalAmount: z.string(),
    discountAmount: z.string(),
    taxAmount: z.string(),
    serviceChargeAmount: z.string(),
    deliveryFeeAmount: z.string(),
    deliveryAddressId: z.string().uuid().nullable(),
    sourceChannel: z.string(),
    isBulkOrder: z.boolean(),
    workflow: z.unknown().nullable(),
    items: z.array(z.unknown()),
    statusHistory: z.array(z.unknown()),
    notes: z.array(z.unknown()),
    approvals: z.array(z.unknown()),
  })
  .openapi('OrderDetail');

const timelineEventSchema = z
  .object({
    id: z.string().uuid(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    eventCode: z.string(),
    occurredAt: z.string(),
  })
  .openapi('TimelineEvent');

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/orders',
  tags: ['Orders'],
  summary: 'Create an order',
  security: [{ companyBearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createOrderSchema } } } },
  responses: {
    201: {
      description: 'Order created',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(orderDetailSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/orders',
  tags: ['Orders'],
  summary: 'List company orders',
  security: [{ companyBearerAuth: [] }],
  request: { query: listOrdersQuerySchema },
  responses: {
    200: {
      description: 'Paginated order list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(orderSummarySchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/orders/{id}',
  tags: ['Orders'],
  summary: 'Get company order detail',
  security: [{ companyBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Order detail',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(orderDetailSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/orders/{id}/cancel',
  tags: ['Orders'],
  summary: 'Cancel an order',
  security: [{ companyBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: cancelOrderSchema } } },
  },
  responses: { 200: { description: 'Order cancelled' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/orders/{id}/tracking',
  tags: ['Orders'],
  summary: 'Get order tracking timeline',
  security: [{ companyBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Timeline events',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(timelineEventSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/orders/{id}/notes',
  tags: ['Orders'],
  summary: 'Add a company order note',
  security: [{ companyBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: addOrderNoteSchema } } },
  },
  responses: { 201: { description: 'Note created' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/company/orders/{id}/approvals/{level}/decide',
  tags: ['Orders'],
  summary: 'Decide on a company order approval level',
  security: [{ companyBearerAuth: [] }],
  request: {
    params: approvalLevelParamsSchema,
    body: { content: { 'application/json': { schema: decideOrderApprovalSchema } } },
  },
  responses: { 200: { description: 'Approval decided' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/orders',
  tags: ['Orders'],
  summary: 'List all orders (dashboard)',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: listDashboardOrdersQuerySchema },
  responses: {
    200: {
      description: 'Paginated order list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(orderSummarySchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/orders/{id}',
  tags: ['Orders'],
  summary: 'Get order detail (dashboard)',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Order detail',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(orderDetailSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/orders/{id}/transitions',
  tags: ['Orders'],
  summary: 'Transition order workflow status',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: transitionOrderSchema } } },
  },
  responses: { 200: { description: 'Order transitioned' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/orders/{id}/notes',
  tags: ['Orders'],
  summary: 'Add a dashboard order note',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: addDashboardOrderNoteSchema } } },
  },
  responses: { 201: { description: 'Note created' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/orders/{id}/approvals/{level}/decide',
  tags: ['Orders'],
  summary: 'Decide on an order approval level (dashboard)',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: approvalLevelParamsSchema,
    body: { content: { 'application/json': { schema: decideOrderApprovalSchema } } },
  },
  responses: { 200: { description: 'Approval decided' } },
});
