import { randomBytes, timingSafeEqual } from 'node:crypto';
import { FulfillmentType } from '@prisma/client';
import { prisma } from '../../prisma/client';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import { permissionResolver } from '../../engines/permissionResolver';
import { timelineService } from '../../engines/timelineService';
import { workflowEngine } from '../../engines/workflowEngine';

export const FULFILLMENT_STEP_CODES = {
  READY: 'ready',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  AWAITING_PICKUP: 'awaiting_pickup',
  PICKED_UP: 'picked_up',
} as const;

const ACTIVE_DELIVERY_STEP_CODES = [
  FULFILLMENT_STEP_CODES.READY,
  FULFILLMENT_STEP_CODES.OUT_FOR_DELIVERY,
] as const;

export function generateFulfillmentQrToken(): string {
  return randomBytes(24).toString('base64url');
}

function getDashboardActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return actor;
}

async function canOnKitchenOrOperations(action: 'view' | 'edit' | 'create'): Promise<boolean> {
  const actor = getDashboardActorOrThrow();
  const kitchen = await permissionResolver.canAsync(actor.id, '/dashboard/kitchen', action);
  if (kitchen) return true;
  return permissionResolver.canAsync(actor.id, '/dashboard/operations', action);
}

async function assertKitchenOrOperations(action: 'view' | 'edit' | 'create') {
  if (!(await canOnKitchenOrOperations(action))) {
    throw new ForbiddenError('Kitchen or Operations permission required');
  }
}

async function getOrderWithWorkflow(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, is_deleted: false },
    include: {
      workflow_instance: { include: { current_step: true } },
      delivery_details: true,
      delivery_address: true,
      company: { select: { id: true, legal_name: true, trade_name: true } },
    },
  });
  if (!order) {
    throw new NotFoundError('Order not found');
  }
  return order;
}

async function findWorkflowStep(workflowId: string, code: string) {
  const step = await prisma.workflowStep.findFirst({
    where: { workflow_id: workflowId, code },
  });
  if (!step) {
    throw new BadRequestError(`Workflow step '${code}' is not configured`);
  }
  return step;
}

async function transitionOrderWorkflow(
  orderId: string,
  toStepCode: string,
  comment?: string,
) {
  const order = await getOrderWithWorkflow(orderId);
  if (!order.workflow_instance_id || !order.workflow_instance) {
    throw new BadRequestError('Order has no workflow instance');
  }

  const toStep = await findWorkflowStep(order.workflow_instance.workflow_id, toStepCode);
  const actor = getRequestActor();

  const result = await workflowEngine.transition({
    instanceId: order.workflow_instance_id,
    toStepId: toStep.id,
    triggerType: 'manual',
    comment,
  });

  await prisma.orderStatusHistory.create({
    data: {
      order_id: orderId,
      status_code: result.currentStepCode,
      changed_by: actor?.id ?? null,
      comment: comment ?? null,
    },
  });

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: `order.status.${result.currentStepCode}`,
    comment,
    actorType: actor?.type ?? 'system',
    actorId: actor?.id,
    metadata: { toStepCode },
  });

  return result;
}

export async function assertDeliveryUserAvailable(dashboardUserId: string, excludeOrderId?: string) {
  const active = await prisma.order.findFirst({
    where: {
      id: excludeOrderId ? { not: excludeOrderId } : undefined,
      fulfillment_type: FulfillmentType.delivery,
      is_deleted: false,
      delivery_details: { assigned_dashboard_user_id: dashboardUserId },
      workflow_instance: {
        current_step: { code: { in: [...ACTIVE_DELIVERY_STEP_CODES] } },
      },
    },
    select: { id: true, order_number: true },
  });

  if (active) {
    throw new BadRequestError(
      `Delivery user already has active order ${active.order_number}. Complete it before assigning another.`,
    );
  }
}

export function serializeDeliveryAddress(address: {
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_province: string | null;
  country_code: string | null;
  postal_code: string | null;
  latitude: { toString(): string } | null;
  longitude: { toString(): string } | null;
  contact_name: string | null;
  contact_phone: string | null;
}) {
  return {
    label: address.label,
    addressLine1: address.address_line1,
    addressLine2: address.address_line2,
    city: address.city,
    stateProvince: address.state_province,
    countryCode: address.country_code,
    postalCode: address.postal_code,
    latitude: address.latitude?.toString() ?? null,
    longitude: address.longitude?.toString() ?? null,
    contactName: address.contact_name,
    contactPhone: address.contact_phone,
  };
}

export function serializeDeliveryOrder(order: Awaited<ReturnType<typeof getOrderWithWorkflow>>) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    companyId: order.company_id,
    companyName: order.company.trade_name ?? order.company.legal_name,
    fulfillmentType: order.fulfillment_type,
    requestedDeliveryAt: order.requested_delivery_at.toISOString(),
    currentStepCode: order.workflow_instance?.current_step.code ?? null,
    currentStepName: order.workflow_instance?.current_step.name ?? null,
    assignedDeliveryUserId: order.delivery_details?.assigned_dashboard_user_id ?? null,
    assignedAt: order.delivery_details?.assigned_at?.toISOString() ?? null,
    deliveryAddress: order.delivery_address
      ? serializeDeliveryAddress(order.delivery_address)
      : null,
  };
}

export async function getCompanyFulfillmentQr(orderId: string) {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, company_id: actor.companyId, is_deleted: false },
    include: { workflow_instance: { include: { current_step: true } } },
  });
  if (!order) {
    throw new NotFoundError('Order not found');
  }
  if (!order.fulfillment_qr_token) {
    throw new BadRequestError('Order has no fulfillment QR token');
  }

  const step = order.workflow_instance?.current_step.code;
  if (step === FULFILLMENT_STEP_CODES.DELIVERED || step === FULFILLMENT_STEP_CODES.PICKED_UP) {
    throw new BadRequestError('Order is already completed');
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    qrPayload: order.fulfillment_qr_token,
    fulfillmentType: order.fulfillment_type,
  };
}

export async function assignDeliveryUser(orderId: string, deliveryUserId: string) {
  await assertKitchenOrOperations('edit');
  const actor = getDashboardActorOrThrow();

  const order = await getOrderWithWorkflow(orderId);
  if (order.fulfillment_type !== FulfillmentType.delivery) {
    throw new BadRequestError('Only delivery orders can be assigned to a delivery user');
  }

  const currentStep = order.workflow_instance?.current_step.code;
  if (currentStep !== FULFILLMENT_STEP_CODES.READY) {
    throw new BadRequestError('Delivery can only be assigned when order is ready');
  }

  const deliveryUser = await prisma.dashboardUser.findFirst({
    where: { id: deliveryUserId, is_deleted: false, status: 'active' },
    include: { roles: { include: { role: true } } },
  });
  if (!deliveryUser) {
    throw new NotFoundError('Delivery user not found');
  }

  const hasDeliveryRole = deliveryUser.roles.some((r) => r.role.name === 'Delivery');
  if (!hasDeliveryRole) {
    throw new BadRequestError('Selected user does not have the Delivery role');
  }

  await assertDeliveryUserAvailable(deliveryUserId, orderId);

  const details = await prisma.orderDeliveryDetails.upsert({
    where: { order_id: orderId },
    create: {
      order_id: orderId,
      assigned_dashboard_user_id: deliveryUserId,
      assigned_by: actor.id,
      assigned_at: new Date(),
    },
    update: {
      assigned_dashboard_user_id: deliveryUserId,
      assigned_by: actor.id,
      assigned_at: new Date(),
    },
  });

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: 'order.delivery.assigned',
    actorType: actor.type,
    actorId: actor.id,
    metadata: { deliveryUserId, deliveryUserName: deliveryUser.full_name },
  });

  return {
    orderId,
    assignedDeliveryUserId: details.assigned_dashboard_user_id,
    assignedAt: details.assigned_at?.toISOString() ?? null,
    assignedBy: actor.id,
  };
}

export async function listMyDeliveryOrders() {
  const actor = getDashboardActorOrThrow();
  const allowed = await permissionResolver.canAsync(actor.id, '/dashboard/delivery', 'view');
  if (!allowed) {
    throw new ForbiddenError("Missing 'view' on '/dashboard/delivery'");
  }

  const orders = await prisma.order.findMany({
    where: {
      fulfillment_type: FulfillmentType.delivery,
      is_deleted: false,
      delivery_details: { assigned_dashboard_user_id: actor.id },
      workflow_instance: {
        current_step: { code: { in: [...ACTIVE_DELIVERY_STEP_CODES] } },
      },
    },
    include: {
      workflow_instance: { include: { current_step: true } },
      delivery_details: true,
      delivery_address: true,
      company: { select: { id: true, legal_name: true, trade_name: true } },
    },
    orderBy: { requested_delivery_at: 'asc' },
  });

  return orders.map(serializeDeliveryOrder);
}

export async function departForDelivery(orderId: string) {
  const actor = getDashboardActorOrThrow();
  const order = await getOrderWithWorkflow(orderId);

  if (order.fulfillment_type !== FulfillmentType.delivery) {
    throw new BadRequestError('Only delivery orders can depart for delivery');
  }

  const isAssignedDelivery =
    order.delivery_details?.assigned_dashboard_user_id === actor.id;
  const isKitchenOrOps = await canOnKitchenOrOperations('edit');

  if (!isAssignedDelivery && !isKitchenOrOps) {
    throw new ForbiddenError('Only the assigned delivery user or kitchen/operations can depart');
  }

  if (!order.delivery_details?.assigned_dashboard_user_id) {
    throw new BadRequestError('Assign a delivery user before departing');
  }

  if (order.workflow_instance?.current_step.code !== FULFILLMENT_STEP_CODES.READY) {
    throw new BadRequestError('Order must be ready before departing for delivery');
  }

  await transitionOrderWorkflow(orderId, FULFILLMENT_STEP_CODES.OUT_FOR_DELIVERY, 'Departed for delivery');
  return getOrderWithWorkflow(orderId).then(serializeDeliveryOrder);
}

export async function confirmDeliveryByQr(orderId: string, qrToken: string) {
  const actor = getDashboardActorOrThrow();
  const order = await getOrderWithWorkflow(orderId);

  if (order.fulfillment_type !== FulfillmentType.delivery) {
    throw new BadRequestError('QR confirmation applies to delivery orders only');
  }

  if (order.delivery_details?.assigned_dashboard_user_id !== actor.id) {
    throw new ForbiddenError('Only the assigned delivery user can confirm delivery');
  }

  if (order.workflow_instance?.current_step.code !== FULFILLMENT_STEP_CODES.OUT_FOR_DELIVERY) {
    throw new BadRequestError('Order must be out for delivery before QR confirmation');
  }

  if (!order.fulfillment_qr_token) {
    throw new BadRequestError('Order has no fulfillment QR token');
  }

  const submitted = Buffer.from(qrToken);
  const expected = Buffer.from(order.fulfillment_qr_token);
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
    throw new BadRequestError('Invalid fulfillment QR code');
  }

  await transitionOrderWorkflow(orderId, FULFILLMENT_STEP_CODES.DELIVERED, 'Delivered — QR confirmed');

  await prisma.orderDeliveryDetails.update({
    where: { order_id: orderId },
    data: { delivered_at: new Date() },
  });

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: 'order.delivery.confirmed',
    actorType: actor.type,
    actorId: actor.id,
  });

  return getOrderWithWorkflow(orderId).then(serializeDeliveryOrder);
}

export async function markAwaitingPickup(orderId: string) {
  await assertKitchenOrOperations('edit');
  const order = await getOrderWithWorkflow(orderId);

  if (order.fulfillment_type !== FulfillmentType.pickup) {
    throw new BadRequestError('Only pickup orders can be marked awaiting pickup');
  }

  if (order.workflow_instance?.current_step.code !== FULFILLMENT_STEP_CODES.READY) {
    throw new BadRequestError('Order must be ready before awaiting pickup');
  }

  await transitionOrderWorkflow(orderId, FULFILLMENT_STEP_CODES.AWAITING_PICKUP, 'Awaiting customer pickup');
  return getOrderWithWorkflow(orderId).then(serializeDeliveryOrder);
}

export async function confirmPickup(orderId: string) {
  await assertKitchenOrOperations('edit');
  const order = await getOrderWithWorkflow(orderId);

  if (order.fulfillment_type !== FulfillmentType.pickup) {
    throw new BadRequestError('Only pickup orders can be confirmed as picked up');
  }

  if (order.workflow_instance?.current_step.code !== FULFILLMENT_STEP_CODES.AWAITING_PICKUP) {
    throw new BadRequestError('Order must be awaiting pickup before confirming pickup');
  }

  await transitionOrderWorkflow(orderId, FULFILLMENT_STEP_CODES.PICKED_UP, 'Customer picked up order');
  return getOrderWithWorkflow(orderId).then(serializeDeliveryOrder);
}

export async function listAssignableDeliveryUsers() {
  await assertKitchenOrOperations('view');

  const users = await prisma.dashboardUser.findMany({
    where: {
      is_deleted: false,
      status: 'active',
      roles: { some: { role: { name: 'Delivery' } } },
    },
    select: { id: true, full_name: true, email: true },
    orderBy: { full_name: 'asc' },
  });

  const availability = await Promise.all(
    users.map(async (user) => {
      try {
        await assertDeliveryUserAvailable(user.id);
        return { ...user, isAvailable: true as const };
      } catch {
        return { ...user, isAvailable: false as const };
      }
    }),
  );

  return availability;
}
