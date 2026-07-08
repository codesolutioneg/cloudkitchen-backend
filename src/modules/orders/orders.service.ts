import { ApprovalStatus, FulfillmentType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../prisma/client';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors/AppError';
import { generateFulfillmentQrToken } from '../fulfillment/fulfillment.service';
import { getRequestActor, type RequestActor } from '../../core/middleware/requestContext';
import { businessRuleResolver } from '../../engines/businessRuleResolver';
import { configResolver } from '../../engines/configResolver';
import { getDashboardCompanyScopeFilter } from '../../engines/companyScopeResolver';
import { menuResolver } from '../../engines/menuResolver';
import { timelineService } from '../../engines/timelineService';
import { computeSlaDueAt, workflowEngine } from '../../engines/workflowEngine';
import { workflowActionDispatcher } from '../../engines/workflowActionDispatcher';

export interface ListOrdersQuery {
  page?: number;
  pageSize?: number;
  companyId?: string;
  statusCode?: string;
  dashboardUserId?: string;
}

export interface CreateOrderItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  notes?: string;
  options?: Array<{ productOptionId: string }>;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  requestedDeliveryAt: string;
  fulfillmentType: FulfillmentType;
  deliveryAddressId?: string;
  departmentId?: string;
  sourceChannel?: string;
  isBulkOrder?: boolean;
}

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

function getDashboardActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return actor;
}

function generateOrderNumber(): string {
  const now = new Date();
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const alnum = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `ORD-${ymd}-${alnum}`;
}

function extractNumberField(value: unknown, keys: string[]): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of keys) {
      if (key in (value as Record<string, unknown>)) {
        const raw = (value as Record<string, unknown>)[key];
        if (typeof raw === 'number') {
          return raw;
        }
      }
    }
  }
  return undefined;
}

async function assertProductOnMenu(menuId: string, productId: string) {
  const assignment = await prisma.catalogMenuProduct.findFirst({
    where: {
      product_id: productId,
      section: { catalog_menu_id: menuId },
      product: { is_active: true, is_deleted: false },
    },
  });
  if (!assignment) {
    throw new BadRequestError(`Product is not available on your assigned menu`);
  }
}

function serializeOrderSummary(order: {
  id: string;
  order_number: string;
  company_id: string;
  currency: string;
  total_amount: Decimal;
  requested_delivery_at: Date;
  fulfillment_type: FulfillmentType;
  created_at: Date;
  workflow_instance?: {
    current_step: { code: string; name: string };
  } | null;
}) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    companyId: order.company_id,
    currency: order.currency,
    totalAmount: order.total_amount.toString(),
    requestedDeliveryAt: order.requested_delivery_at.toISOString(),
    fulfillmentType: order.fulfillment_type,
    createdAt: order.created_at.toISOString(),
    currentStepCode: order.workflow_instance?.current_step.code ?? null,
    currentStepName: order.workflow_instance?.current_step.name ?? null,
  };
}

function serializeOrderDetail(
  order: {
    id: string;
    order_number: string;
    company_id: string;
    department_id: string | null;
    ordered_by_user_id: string;
    workflow_instance_id: string | null;
    currency: string;
    subtotal_amount: Decimal;
    discount_amount: Decimal;
    tax_amount: Decimal;
    service_charge_amount: Decimal;
    delivery_fee_amount: Decimal;
    total_amount: Decimal;
    requested_delivery_at: Date;
    delivery_address_id: string | null;
    fulfillment_type: FulfillmentType;
    source_channel: string;
    is_bulk_order: boolean;
    created_at: Date;
    items: Array<{
      id: string;
      product_id: string;
      variant_id: string | null;
      product_name_snapshot: string;
      unit_price_snapshot: Decimal;
      quantity: number;
      line_total: Decimal;
      notes: string | null;
      options: Array<{
        id: string;
        product_option_id: string;
        price_adjustment_snapshot: Decimal;
      }>;
    }>;
    status_history: Array<{
      id: string;
      status_code: string;
      changed_by: string | null;
      changed_at: Date;
      comment: string | null;
    }>;
    notes: Array<{
      id: string;
      author_type: string;
      author_id: string;
      note: string;
      is_internal: boolean;
      created_at: Date;
    }>;
    approvals: Array<{
      id: string;
      approval_level: number;
      approver_type: string;
      approver_id: string;
      status: string;
      decided_at: Date | null;
      comment: string | null;
    }>;
    workflow_instance?: {
      id: string;
      current_step: { id: string; code: string; name: string; step_type: string };
      entered_step_at: Date;
      sla_due_at: Date | null;
    } | null;
  },
  includeInternalNotes: boolean,
) {
  const notes = includeInternalNotes
    ? order.notes
    : order.notes.filter((n) => !n.is_internal);

  return {
    id: order.id,
    orderNumber: order.order_number,
    companyId: order.company_id,
    departmentId: order.department_id,
    orderedByUserId: order.ordered_by_user_id,
    workflowInstanceId: order.workflow_instance_id,
    currency: order.currency,
    subtotalAmount: order.subtotal_amount.toString(),
    discountAmount: order.discount_amount.toString(),
    taxAmount: order.tax_amount.toString(),
    serviceChargeAmount: order.service_charge_amount.toString(),
    deliveryFeeAmount: order.delivery_fee_amount.toString(),
    totalAmount: order.total_amount.toString(),
    requestedDeliveryAt: order.requested_delivery_at.toISOString(),
    deliveryAddressId: order.delivery_address_id,
    fulfillmentType: order.fulfillment_type,
    sourceChannel: order.source_channel,
    isBulkOrder: order.is_bulk_order,
    createdAt: order.created_at.toISOString(),
    workflow: order.workflow_instance
      ? {
          instanceId: order.workflow_instance.id,
          currentStepId: order.workflow_instance.current_step.id,
          currentStepCode: order.workflow_instance.current_step.code,
          currentStepName: order.workflow_instance.current_step.name,
          currentStepType: order.workflow_instance.current_step.step_type,
          enteredStepAt: order.workflow_instance.entered_step_at.toISOString(),
          slaDueAt: order.workflow_instance.sla_due_at?.toISOString() ?? null,
        }
      : null,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      variantId: item.variant_id,
      productNameSnapshot: item.product_name_snapshot,
      unitPriceSnapshot: item.unit_price_snapshot.toString(),
      quantity: item.quantity,
      lineTotal: item.line_total.toString(),
      notes: item.notes,
      options: item.options.map((opt) => ({
        id: opt.id,
        productOptionId: opt.product_option_id,
        priceAdjustmentSnapshot: opt.price_adjustment_snapshot.toString(),
      })),
    })),
    statusHistory: order.status_history.map((h) => ({
      id: h.id,
      statusCode: h.status_code,
      changedBy: h.changed_by,
      changedAt: h.changed_at.toISOString(),
      comment: h.comment,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      authorType: n.author_type,
      authorId: n.author_id,
      note: n.note,
      isInternal: n.is_internal,
      createdAt: n.created_at.toISOString(),
    })),
    approvals: order.approvals.map((a) => ({
      id: a.id,
      approvalLevel: a.approval_level,
      approverType: a.approver_type,
      approverId: a.approver_id,
      status: a.status,
      decidedAt: a.decided_at?.toISOString() ?? null,
      comment: a.comment,
    })),
  };
}

const orderDetailInclude = {
  items: { include: { options: true } },
  status_history: { orderBy: { changed_at: 'asc' as const } },
  notes: { orderBy: { created_at: 'asc' as const } },
  approvals: { orderBy: { approval_level: 'asc' as const } },
  workflow_instance: { include: { current_step: true } },
};

async function getOrderOrThrow(orderId: string, companyScope?: Prisma.OrderWhereInput) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, is_deleted: false, ...(companyScope ?? {}) },
    include: orderDetailInclude,
  });
  if (!order) {
    throw new NotFoundError('Order not found');
  }
  return order;
}

async function validateOrderingRules(
  companyId: string,
  departmentId: string | undefined,
  userId: string,
  totalQuantity: number,
  requestedDeliveryAt: Date,
) {
  const [minOrderQty, maxOrderQty, minNoticeHours] = await Promise.all([
    businessRuleResolver.resolve({
      ruleTypeCode: 'min_order_qty',
      companyId,
      departmentId,
      userId,
    }),
    businessRuleResolver.resolve({
      ruleTypeCode: 'max_order_qty',
      companyId,
      departmentId,
      userId,
    }),
    businessRuleResolver.resolve({
      ruleTypeCode: 'min_notice_hours',
      companyId,
      departmentId,
      userId,
    }),
  ]);

  const minQty = extractNumberField(minOrderQty, ['minQty', 'value', 'quantity']);
  if (minQty !== undefined && totalQuantity < minQty) {
    throw new BadRequestError(`Minimum order quantity is ${minQty}`);
  }

  const maxQty = extractNumberField(maxOrderQty, ['maxQty', 'value', 'quantity']);
  if (maxQty !== undefined && totalQuantity > maxQty) {
    throw new BadRequestError(`Maximum order quantity is ${maxQty}`);
  }

  const noticeHours = extractNumberField(minNoticeHours, ['hours', 'minHours', 'value']);
  if (noticeHours !== undefined) {
    const minDeliveryAt = new Date(Date.now() + noticeHours * 60 * 60 * 1000);
    if (requestedDeliveryAt < minDeliveryAt) {
      throw new BadRequestError(`Requested delivery must be at least ${noticeHours} hours from now`);
    }
  }
}

export async function createOrder(input: CreateOrderInput) {
  const actor = getCompanyActorOrThrow();

  if (!input.items.length) {
    throw new BadRequestError('Order must contain at least one item');
  }

  const company = await prisma.company.findFirst({
    where: { id: actor.companyId, is_deleted: false },
  });
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  if (company.approval_status !== ApprovalStatus.approved) {
    throw new BadRequestError('Company must be approved before placing orders');
  }

  const user = await prisma.companyUser.findFirst({
    where: { id: actor.id, company_id: actor.companyId },
    select: { department_id: true },
  });

  const departmentId = input.departmentId ?? user?.department_id ?? undefined;
  const menuId = await menuResolver.resolveEffectiveMenu(
    actor.companyId,
    departmentId,
    actor.id,
  );
  if (!menuId) {
    throw new BadRequestError('No catalog menu assigned to your company');
  }

  const requestedDeliveryAt = new Date(input.requestedDeliveryAt);
  if (Number.isNaN(requestedDeliveryAt.getTime())) {
    throw new BadRequestError('Invalid requested delivery date');
  }

  const totalQuantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
  await validateOrderingRules(
    actor.companyId,
    departmentId,
    actor.id,
    totalQuantity,
    requestedDeliveryAt,
  );

  const vatConfig = await configResolver.resolve(actor.companyId, 'ordering.default_vat_rate');
  const vatRate =
    typeof vatConfig.value === 'number'
      ? vatConfig.value
      : Number(vatConfig.value) || 0;

  const lineItems: Array<{
    productId: string;
    variantId: string | null;
    productName: string;
    unitPrice: Decimal;
    quantity: number;
    lineTotal: Decimal;
    notes: string | null;
    options: Array<{ productOptionId: string; priceAdjustment: Decimal }>;
    currency: string;
  }> = [];

  for (const item of input.items) {
    if (item.quantity < 1) {
      throw new BadRequestError('Item quantity must be at least 1');
    }

    await assertProductOnMenu(menuId, item.productId);

    const product = await prisma.product.findFirst({
      where: { id: item.productId, is_deleted: false, is_active: true },
    });
    if (!product) {
      throw new BadRequestError(`Product not found: ${item.productId}`);
    }

    const resolvedPrice = await menuResolver.resolveProductPrice(
      actor.companyId,
      item.productId,
      item.variantId,
    );

    let unitPrice = new Decimal(resolvedPrice.price);
    const options: Array<{ productOptionId: string; priceAdjustment: Decimal }> = [];

    if (item.options?.length) {
      for (const opt of item.options) {
        const productOption = await prisma.productOption.findFirst({
          where: { id: opt.productOptionId, is_active: true },
        });
        if (!productOption) {
          throw new BadRequestError(`Product option not found: ${opt.productOptionId}`);
        }
        options.push({
          productOptionId: opt.productOptionId,
          priceAdjustment: productOption.price_adjustment,
        });
        unitPrice = unitPrice.add(productOption.price_adjustment);
      }
    }

    const lineTotal = unitPrice.mul(item.quantity);
    lineItems.push({
      productId: item.productId,
      variantId: item.variantId ?? null,
      productName: product.name,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
      notes: item.notes ?? null,
      options,
      currency: resolvedPrice.currency,
    });
  }

  const currency = lineItems[0]!.currency;
  const subtotal = lineItems.reduce(
    (sum, item) => sum.add(item.lineTotal),
    new Decimal(0),
  );
  const taxAmount = subtotal.mul(vatRate);
  const totalAmount = subtotal.add(taxAmount);

  const workflow = await workflowEngine.resolveWorkflowForEntity('order', actor.companyId);
  const initialStep = await prisma.workflowStep.findFirst({
    where: { workflow_id: workflow.id, step_type: 'initial' },
    orderBy: { sort_order: 'asc' },
  });
  if (!initialStep) {
    throw new BadRequestError('Order workflow has no initial step');
  }

  const enteredAt = new Date();
  const slaDueAt = computeSlaDueAt(enteredAt, initialStep.sla_minutes);
  const orderNumber = generateOrderNumber();
  const fulfillmentQrToken = generateFulfillmentQrToken();

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        company_id: actor.companyId,
        department_id: departmentId ?? null,
        ordered_by_user_id: actor.id,
        order_number: orderNumber,
        currency,
        subtotal_amount: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        requested_delivery_at: requestedDeliveryAt,
        delivery_address_id: input.deliveryAddressId ?? null,
        fulfillment_type: input.fulfillmentType,
        source_channel: input.sourceChannel ?? 'web',
        is_bulk_order: input.isBulkOrder ?? false,
        fulfillment_qr_token: fulfillmentQrToken,
      },
    });

    if (input.fulfillmentType === FulfillmentType.delivery) {
      await tx.orderDeliveryDetails.create({
        data: { order_id: order.id },
      });
    }

    for (const item of lineItems) {
      const orderItem = await tx.orderItem.create({
        data: {
          order_id: order.id,
          product_id: item.productId,
          variant_id: item.variantId,
          product_name_snapshot: item.productName,
          unit_price_snapshot: item.unitPrice,
          quantity: item.quantity,
          line_total: item.lineTotal,
          notes: item.notes,
        },
      });

      for (const opt of item.options) {
        await tx.orderItemOption.create({
          data: {
            order_item_id: orderItem.id,
            product_option_id: opt.productOptionId,
            price_adjustment_snapshot: opt.priceAdjustment,
          },
        });
      }
    }

    const instance = await tx.entityWorkflowInstance.create({
      data: {
        workflow_id: workflow.id,
        entity_type: 'order',
        entity_id: order.id,
        current_step_id: initialStep.id,
        entered_step_at: enteredAt,
        sla_due_at: slaDueAt,
      },
    });

    await tx.entityWorkflowHistory.create({
      data: {
        workflow_instance_id: instance.id,
        from_step_id: null,
        to_step_id: initialStep.id,
        actor_type: actor.type,
        actor_id: actor.id,
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { workflow_instance_id: instance.id },
    });

    await tx.orderStatusHistory.create({
      data: {
        order_id: order.id,
        status_code: initialStep.code,
        changed_by: actor.id,
        comment: 'Order created',
      },
    });

    await tx.timelineEvent.create({
      data: {
        entity_type: 'order',
        entity_id: order.id,
        event_code: 'order.created',
        actor_type: actor.type,
        actor_id: actor.id,
        source: input.sourceChannel ?? 'web',
        comment: `Order ${orderNumber} created`,
        metadata: { orderNumber, totalAmount: totalAmount.toString() },
      },
    });

    return { order, instance, initialStepId: initialStep.id };
  });

  await workflowActionDispatcher.dispatchStepActions(result.initialStepId, {
    instanceId: result.instance.id,
    workflowId: workflow.id,
    entityType: 'order',
    entityId: result.order.id,
  });

  return getOrder(actor.companyId, result.order.id);
}

export async function listCompanyOrders(query: ListOrdersQuery) {
  const actor = getCompanyActorOrThrow();
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.OrderWhereInput = {
    is_deleted: false,
    company_id: actor.companyId,
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
      include: { workflow_instance: { include: { current_step: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items: items.map(serializeOrderSummary),
    pagination: { page, pageSize, totalItems },
  };
}

export async function getCompanyOrder(orderId: string) {
  const actor = getCompanyActorOrThrow();
  const order = await getOrderOrThrow(orderId, { company_id: actor.companyId });
  return serializeOrderDetail(order, false);
}

export async function listDashboardOrders(query: ListOrdersQuery) {
  getDashboardActorOrThrow();
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const companyScope = query.dashboardUserId
    ? await getDashboardCompanyScopeFilter(query.dashboardUserId)
    : undefined;

  const where: Prisma.OrderWhereInput = {
    is_deleted: false,
    ...(query.companyId ? { company_id: query.companyId } : {}),
    ...(companyScope ? { company: companyScope } : {}),
    ...(query.statusCode
      ? { workflow_instance: { current_step: { code: query.statusCode } } }
      : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
      include: { workflow_instance: { include: { current_step: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items: items.map(serializeOrderSummary),
    pagination: { page, pageSize, totalItems },
  };
}

export async function getDashboardOrder(orderId: string) {
  getDashboardActorOrThrow();
  const order = await getOrderOrThrow(orderId);
  return serializeOrderDetail(order, true);
}

async function getOrder(companyId: string, orderId: string) {
  const order = await getOrderOrThrow(orderId, { company_id: companyId });
  return serializeOrderDetail(order, false);
}

async function findCancelledStep(workflowId: string) {
  return prisma.workflowStep.findFirst({
    where: { workflow_id: workflowId, code: 'cancelled' },
  });
}

async function canTransitionToCancelled(
  workflowId: string,
  fromStepId: string,
  cancelledStepId: string,
): Promise<boolean> {
  const transition = await prisma.workflowTransition.findFirst({
    where: {
      workflow_id: workflowId,
      from_step_id: fromStepId,
      to_step_id: cancelledStepId,
      trigger_type: 'manual',
    },
  });
  return transition !== null;
}

export async function cancelCompanyOrder(orderId: string, reasonText?: string) {
  const actor = getCompanyActorOrThrow();
  const order = await getOrderOrThrow(orderId, { company_id: actor.companyId });

  if (!order.workflow_instance_id || !order.workflow_instance) {
    throw new BadRequestError('Order has no workflow instance');
  }

  const cancelledStep = await findCancelledStep(order.workflow_instance.workflow_id);
  if (!cancelledStep) {
    throw new BadRequestError('Cancellation is not configured for this workflow');
  }

  const allowed = await canTransitionToCancelled(
    order.workflow_instance.workflow_id,
    order.workflow_instance.current_step_id,
    cancelledStep.id,
  );
  if (!allowed) {
    throw new BadRequestError('Order cannot be cancelled from its current status');
  }

  await workflowEngine.transition({
    instanceId: order.workflow_instance_id,
    toStepId: cancelledStep.id,
    triggerType: 'manual',
    comment: reasonText,
  });

  await prisma.$transaction([
    prisma.orderStatusHistory.create({
      data: {
        order_id: orderId,
        status_code: cancelledStep.code,
        changed_by: actor.id,
        comment: reasonText ?? 'Cancelled by company',
      },
    }),
    prisma.orderCancellation.create({
      data: {
        order_id: orderId,
        cancelled_by_type: 'company_user',
        cancelled_by_id: actor.id,
        reason_text: reasonText ?? null,
      },
    }),
  ]);

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: 'order.cancelled',
    comment: reasonText,
    actorType: actor.type,
    actorId: actor.id,
  });

  return getCompanyOrder(orderId);
}

export async function transitionDashboardOrder(
  orderId: string,
  input: { toStepId: string; comment?: string; context?: Record<string, unknown> },
) {
  const actor = getDashboardActorOrThrow();
  const order = await getOrderOrThrow(orderId);

  if (!order.workflow_instance_id) {
    throw new BadRequestError('Order has no workflow instance');
  }

  const transitionResult = await workflowEngine.transition({
    instanceId: order.workflow_instance_id,
    toStepId: input.toStepId,
    triggerType: 'manual',
    comment: input.comment,
    context: input.context,
  });

  await prisma.orderStatusHistory.create({
    data: {
      order_id: orderId,
      status_code: transitionResult.currentStepCode,
      changed_by: actor.id,
      comment: input.comment ?? null,
    },
  });

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: `order.status.${transitionResult.currentStepCode}`,
    comment: input.comment,
    actorType: actor.type,
    actorId: actor.id,
    metadata: { toStepId: input.toStepId },
  });

  return getDashboardOrder(orderId);
}

export async function getOrderTracking(orderId: string) {
  const actor = getCompanyActorOrThrow();
  await getOrderOrThrow(orderId, { company_id: actor.companyId });
  return timelineService.listTimelineEvents('order', orderId);
}

export async function addCompanyOrderNote(orderId: string, note: string) {
  const actor = getCompanyActorOrThrow();
  await getOrderOrThrow(orderId, { company_id: actor.companyId });

  const row = await prisma.orderNote.create({
    data: {
      order_id: orderId,
      author_type: 'company_user',
      author_id: actor.id,
      note,
      is_internal: false,
    },
  });

  return {
    id: row.id,
    authorType: row.author_type,
    authorId: row.author_id,
    note: row.note,
    isInternal: row.is_internal,
    createdAt: row.created_at.toISOString(),
  };
}

export async function addDashboardOrderNote(
  orderId: string,
  input: { note: string; isInternal?: boolean },
) {
  const actor = getDashboardActorOrThrow();
  await getOrderOrThrow(orderId);

  const row = await prisma.orderNote.create({
    data: {
      order_id: orderId,
      author_type: 'dashboard_user',
      author_id: actor.id,
      note: input.note,
      is_internal: input.isInternal ?? false,
    },
  });

  return {
    id: row.id,
    authorType: row.author_type,
    authorId: row.author_id,
    note: row.note,
    isInternal: row.is_internal,
    createdAt: row.created_at.toISOString(),
  };
}

export async function decideOrderApproval(
  orderId: string,
  level: number,
  input: { decision: 'approved' | 'rejected'; comment?: string },
  actor: RequestActor,
) {
  const order = await getOrderOrThrow(
    orderId,
    actor.type === 'company_user' && actor.companyId
      ? { company_id: actor.companyId }
      : undefined,
  );

  let approval = await prisma.orderApproval.findFirst({
    where: { order_id: orderId, approval_level: level },
  });

  if (!approval) {
    approval = await prisma.orderApproval.create({
      data: {
        order_id: orderId,
        approver_type: actor.type,
        approver_id: actor.id,
        approval_level: level,
        status: 'pending',
      },
    });
  }

  if (approval.status !== 'pending') {
    throw new BadRequestError('Approval at this level has already been decided');
  }

  const updated = await prisma.orderApproval.update({
    where: { id: approval.id },
    data: {
      status: input.decision,
      decided_at: new Date(),
      comment: input.comment ?? null,
      approver_type: actor.type,
      approver_id: actor.id,
    },
  });

  await timelineService.recordTimelineEvent({
    entityType: 'order',
    entityId: orderId,
    eventCode: `order.approval.${input.decision}`,
    comment: input.comment,
    actorType: actor.type,
    actorId: actor.id,
    metadata: { level, orderNumber: order.order_number },
  });

  return {
    id: updated.id,
    approvalLevel: updated.approval_level,
    status: updated.status,
    decidedAt: updated.decided_at?.toISOString() ?? null,
    comment: updated.comment,
  };
}
