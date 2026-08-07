import { FulfillmentType, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { ForbiddenError } from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import { calendarColor } from '../../engines/orderPaymentGuards';
import { createOrder, type CreateOrderInput } from './orders.service';

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

export interface ScheduleOrdersInput extends Omit<CreateOrderInput, 'requestedDeliveryAt'> {
  dates: string[];
  preferredTime?: string;
}

function combineDateAndTime(dateStr: string, timeStr?: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const time = timeStr ?? '12:00';
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, hh ?? 12, mm ?? 0, 0));
}

export async function scheduleOrders(input: ScheduleOrdersInput) {
  const actor = getCompanyActorOrThrow();
  if (!input.dates.length) {
    throw new ForbiddenError('At least one delivery date is required');
  }

  const uniqueDates = [...new Set(input.dates)].sort();

  const series = await prisma.orderSeries.create({
    data: {
      company_id: actor.companyId,
      ordered_by_user_id: actor.id,
      fulfillment_type: input.fulfillmentType,
      delivery_address_id: input.deliveryAddressId ?? null,
      department_id: input.departmentId ?? null,
      preferred_time: input.preferredTime ?? '12:00',
      source_channel: input.sourceChannel ?? 'web',
    },
  });

  const orders = [];
  for (const dateStr of uniqueDates) {
    const requestedDeliveryAt = combineDateAndTime(dateStr, input.preferredTime).toISOString();
    const order = await createOrder({
      ...input,
      requestedDeliveryAt,
      isBulkOrder: uniqueDates.length > 1,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { series_id: series.id },
    });
    orders.push({ ...order, seriesId: series.id, scheduledDate: dateStr });
  }

  return {
    seriesId: series.id,
    orderCount: orders.length,
    orders,
  };
}

export async function getOrderCalendar(query: { from: string; to: string }) {
  const actor = getCompanyActorOrThrow();
  const from = new Date(query.from);
  const to = new Date(query.to);
  to.setHours(23, 59, 59, 999);

  const orders = await prisma.order.findMany({
    where: {
      company_id: actor.companyId,
      is_deleted: false,
      requested_delivery_at: { gte: from, lte: to },
    },
    include: {
      workflow_instance: { include: { current_step: true } },
      payment: true,
    },
    orderBy: { requested_delivery_at: 'asc' },
  });

  return orders.map((o) => {
    const stepCode = o.workflow_instance?.current_step.code ?? null;
    const paymentStatus = o.payment?.status ?? 'awaiting_proof';
    const cancellable =
      stepCode !== 'cancelled' &&
      paymentStatus !== 'approved' &&
      !['delivered', 'picked_up', 'refunded'].includes(stepCode ?? '');

    return {
      id: o.id,
      orderNumber: o.order_number,
      seriesId: o.series_id,
      date: o.requested_delivery_at.toISOString().slice(0, 10),
      requestedDeliveryAt: o.requested_delivery_at.toISOString(),
      totalAmount: o.total_amount.toString(),
      currency: o.currency,
      fulfillmentType: o.fulfillment_type,
      statusCode: stepCode,
      statusName: o.workflow_instance?.current_step.name ?? null,
      paymentStatus,
      color: calendarColor(stepCode, paymentStatus),
      cancellable,
    };
  });
}
