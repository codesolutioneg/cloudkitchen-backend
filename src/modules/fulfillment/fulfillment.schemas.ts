import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const idParamsSchema = z.object({ id: z.string().uuid() });

export const assignDeliverySchema = z.object({
  deliveryUserId: z.string().uuid(),
});

export const confirmDeliveryQrSchema = z.object({
  qrToken: z.string().min(8).max(64),
});

const deliveryAddressSchema = z.object({
  label: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  stateProvince: z.string().nullable(),
  countryCode: z.string().nullable(),
  postalCode: z.string().nullable(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
});

const deliveryOrderSchema = z
  .object({
    id: z.string().uuid(),
    orderNumber: z.string(),
    companyId: z.string().uuid(),
    companyName: z.string(),
    fulfillmentType: z.enum(['delivery', 'pickup']),
    requestedDeliveryAt: z.string(),
    currentStepCode: z.string().nullable(),
    currentStepName: z.string().nullable(),
    assignedDeliveryUserId: z.string().uuid().nullable(),
    assignedAt: z.string().nullable(),
    deliveryAddress: deliveryAddressSchema.nullable(),
  })
  .openapi('DeliveryOrderView');

const fulfillmentQrSchema = z
  .object({
    orderId: z.string().uuid(),
    orderNumber: z.string(),
    qrPayload: z.string(),
    fulfillmentType: z.enum(['delivery', 'pickup']),
  })
  .openapi('FulfillmentQrPayload');

registry.registerPath({
  method: 'get',
  path: '/api/v1/company/orders/{id}/fulfillment-qr',
  tags: ['Fulfillment'],
  summary: 'Get QR payload for order fulfillment (company user only)',
  security: [{ companyBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'QR payload for display to receiving party',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(fulfillmentQrSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/delivery/orders',
  tags: ['Fulfillment'],
  summary: 'List orders assigned to the authenticated delivery user',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Assigned delivery orders with address coordinates',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(deliveryOrderSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/delivery/users',
  tags: ['Fulfillment'],
  summary: 'List delivery users and availability for assignment',
  security: [{ dashboardBearerAuth: [] }],
  responses: { 200: { description: 'Delivery users list' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/orders/{id}/assign-delivery',
  tags: ['Fulfillment'],
  summary: 'Assign a delivery user to a ready delivery order (kitchen or operations)',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: assignDeliverySchema } } },
  },
  responses: { 200: { description: 'Delivery user assigned' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/delivery/orders/{id}/depart',
  tags: ['Fulfillment'],
  summary: 'Mark order as out for delivery',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Order departed',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(deliveryOrderSchema) },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/delivery/orders/{id}/confirm-delivery',
  tags: ['Fulfillment'],
  summary: 'Confirm delivery by scanning company QR code',
  security: [{ dashboardBearerAuth: [] }],
  request: {
    params: idParamsSchema,
    body: { content: { 'application/json': { schema: confirmDeliveryQrSchema } } },
  },
  responses: { 200: { description: 'Delivery confirmed' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/orders/{id}/awaiting-pickup',
  tags: ['Fulfillment'],
  summary: 'Mark pickup order as awaiting customer pickup (operations/kitchen)',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: { 200: { description: 'Awaiting pickup' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/dashboard/orders/{id}/confirm-pickup',
  tags: ['Fulfillment'],
  summary: 'Confirm customer picked up order (operations/kitchen)',
  security: [{ dashboardBearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: { 200: { description: 'Pickup confirmed' } },
});
