import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';

/**
 * Production planning (§35).
 *
 * What the kitchen has to make on a given day, across every client, in one
 * list. Aggregated from the orders that already exist; nothing new is captured.
 *
 * A day can be read live or locked into a snapshot. The snapshot is what a
 * shift cooks from: orders placed after the lock must not silently change the
 * sheet somebody is already working from.
 */

/** Committed work. */
const CONFIRMED_STEPS = ['payment_approved', 'kitchen_accepted', 'preparing'];
/** Placed but not yet certain, kept separate so the kitchen can judge risk. */
const UNCONFIRMED_STEPS = [
  'submitted',
  'pending_approval',
  'awaiting_payment_proof',
  'payment_pending_review',
];
/** Already made. */
const PRODUCED_STEPS = ['ready', 'out_for_delivery', 'awaiting_pickup', 'delivered', 'picked_up'];

const COUNTED_STEPS = [...CONFIRMED_STEPS, ...UNCONFIRMED_STEPS, ...PRODUCED_STEPS];

function actor() {
  const a = getRequestActor();
  if (a?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return a;
}

/**
 * The delivery-day window, half-open so an order at exactly midnight belongs
 * to one day only.
 */
function dayWindow(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestError('Expected a date as YYYY-MM-DD');
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

interface AggregatedLine {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  componentType: string | null;
  confirmedQty: number;
  unconfirmedQty: number;
  producedQty: number;
  plannedQty: number;
  orderCount: number;
  companyCount: number;
  prepTimeMins: number | null;
  lineSubtotal: Decimal;
  unitCost: Decimal | null;
  lineCost: Decimal | null;
}

async function aggregateDay(dateStr: string) {
  const { start, end } = dayWindow(dateStr);

  const orders = await prisma.order.findMany({
    where: {
      is_deleted: false,
      requested_delivery_at: { gte: start, lt: end },
      workflow_instance: { current_step: { code: { in: COUNTED_STEPS } } },
    },
    select: {
      id: true,
      company_id: true,
      currency: true,
      workflow_instance: { select: { current_step: { select: { code: true } } } },
      items: {
        select: {
          product_id: true,
          variant_id: true,
          product_name_snapshot: true,
          quantity: true,
          line_total: true,
          unit_cost_snapshot: true,
          variant: { select: { variant_name: true } },
          product: {
            select: {
              prep_time_mins: true,
              category: { select: { id: true, name: true } },
              nutrition: { select: { component_type: true } },
            },
          },
        },
      },
    },
  });

  const byKey = new Map<
    string,
    AggregatedLine & { orders: Set<string>; companies: Set<string> }
  >();
  const currencies = new Set<string>();
  const companies = new Set<string>();

  for (const order of orders) {
    const step = order.workflow_instance?.current_step.code ?? '';
    currencies.add(order.currency);
    companies.add(order.company_id);

    for (const item of order.items) {
      const key = `${item.product_id}:${item.variant_id ?? ''}`;
      let line = byKey.get(key);
      if (!line) {
        line = {
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name_snapshot,
          variantName: item.variant?.variant_name ?? null,
          categoryId: item.product?.category?.id ?? null,
          categoryName: item.product?.category?.name ?? null,
          componentType: item.product?.nutrition?.component_type ?? null,
          confirmedQty: 0,
          unconfirmedQty: 0,
          producedQty: 0,
          plannedQty: 0,
          orderCount: 0,
          companyCount: 0,
          prepTimeMins: item.product?.prep_time_mins ?? null,
          lineSubtotal: new Decimal(0),
          unitCost: item.unit_cost_snapshot,
          lineCost: null,
          orders: new Set<string>(),
          companies: new Set<string>(),
        };
        byKey.set(key, line);
      }

      if (CONFIRMED_STEPS.includes(step)) line.confirmedQty += item.quantity;
      else if (PRODUCED_STEPS.includes(step)) line.producedQty += item.quantity;
      else line.unconfirmedQty += item.quantity;

      line.plannedQty += item.quantity;
      line.lineSubtotal = line.lineSubtotal.plus(item.line_total);
      line.orders.add(order.id);
      line.companies.add(order.company_id);

      // Cost only counts where the order actually recorded one.
      if (item.unit_cost_snapshot) {
        line.lineCost = (line.lineCost ?? new Decimal(0)).plus(
          item.unit_cost_snapshot.times(item.quantity),
        );
      }
    }
  }

  const lines = [...byKey.values()]
    .map((line) => ({ ...line, orderCount: line.orders.size, companyCount: line.companies.size }))
    .sort(
      (a, b) =>
        (a.componentType ?? 'zz').localeCompare(b.componentType ?? 'zz') ||
        a.productName.localeCompare(b.productName),
    );

  const totalPortions = lines.reduce((sum, l) => sum + l.plannedQty, 0);
  const costedPortions = lines.reduce((sum, l) => sum + (l.unitCost ? l.plannedQty : 0), 0);
  const subtotal = lines.reduce((sum, l) => sum.plus(l.lineSubtotal), new Decimal(0));
  const cost = lines.reduce((sum, l) => (l.lineCost ? sum.plus(l.lineCost) : sum), new Decimal(0));

  return {
    date: dateStr,
    windowStart: start,
    windowEnd: end,
    orderCount: orders.length,
    companyCount: companies.size,
    totalPortions,
    // Rough kitchen load: prep time per dish times the portions of it.
    estimatedPrepMinutes: lines.reduce((sum, l) => sum + (l.prepTimeMins ?? 0) * l.plannedQty, 0),
    currency: currencies.size === 1 ? [...currencies][0]! : 'EGP',
    currencyMismatch: currencies.size > 1,
    subtotal,
    cost: costedPortions > 0 ? cost : null,
    costedPortions,
    uncostedPortions: totalPortions - costedPortions,
    lines,
  };
}

function serializeLine(line: AggregatedLine) {
  return {
    productId: line.productId,
    variantId: line.variantId,
    productName: line.productName,
    variantName: line.variantName,
    categoryName: line.categoryName,
    componentType: line.componentType,
    confirmedQty: line.confirmedQty,
    unconfirmedQty: line.unconfirmedQty,
    producedQty: line.producedQty,
    plannedQty: line.plannedQty,
    orderCount: line.orderCount,
    companyCount: line.companyCount,
    prepTimeMins: line.prepTimeMins,
    lineSubtotal: line.lineSubtotal.toFixed(2),
    unitCost: line.unitCost?.toFixed(4) ?? null,
    lineCost: line.lineCost?.toFixed(2) ?? null,
  };
}

/** The live prep list for a day, recomputed on every read. */
export async function getDayPlan(dateStr: string) {
  actor();
  const day = await aggregateDay(dateStr);
  return {
    date: day.date,
    orderCount: day.orderCount,
    companyCount: day.companyCount,
    totalPortions: day.totalPortions,
    estimatedPrepMinutes: day.estimatedPrepMinutes,
    currency: day.currency,
    currencyMismatch: day.currencyMismatch,
    subtotal: day.subtotal.toFixed(2),
    // Null rather than a number when nothing on the day carries a cost.
    cost: day.cost?.toFixed(2) ?? null,
    costedPortions: day.costedPortions,
    uncostedPortions: day.uncostedPortions,
    costCoveragePercent:
      day.totalPortions === 0 ? '0.00' : ((day.costedPortions / day.totalPortions) * 100).toFixed(2),
    lines: day.lines.map(serializeLine),
  };
}

/**
 * Freezes a day into a snapshot the kitchen can cook from.
 *
 * Re-locking supersedes the previous snapshot with a new version rather than
 * editing it, so what an earlier shift was handed stays recoverable.
 */
export async function lockDay(dateStr: string) {
  const a = actor();
  const day = await aggregateDay(dateStr);
  if (day.lines.length === 0) {
    throw new BadRequestError('There is nothing to produce on that date');
  }

  const previous = await prisma.productionPlan.findFirst({
    where: { production_date: day.windowStart },
    orderBy: { snapshot_version: 'desc' },
    select: { snapshot_version: true },
  });

  const plan = await prisma.productionPlan.create({
    data: {
      production_date: day.windowStart,
      time_zone: 'UTC',
      window_start: day.windowStart,
      window_end: day.windowEnd,
      status: 'locked',
      snapshot_version: (previous?.snapshot_version ?? 0) + 1,
      order_count: day.orderCount,
      company_count: day.companyCount,
      total_portions: day.totalPortions,
      estimated_prep_minutes: day.estimatedPrepMinutes,
      currency: day.currency,
      currency_mismatch: day.currencyMismatch,
      snapshot_subtotal: day.subtotal,
      snapshot_cost: day.cost,
      costed_portions: day.costedPortions,
      uncosted_portions: day.uncostedPortions,
      created_by_type: a.type,
      created_by_id: a.id,
      lines: {
        create: day.lines.map((line) => ({
          product_id: line.productId,
          variant_id: line.variantId,
          product_name_snapshot: line.productName,
          variant_name_snapshot: line.variantName,
          category_id: line.categoryId,
          category_name_snapshot: line.categoryName,
          component_type: line.componentType,
          confirmed_qty: line.confirmedQty,
          unconfirmed_qty: line.unconfirmedQty,
          produced_qty: line.producedQty,
          planned_qty: line.plannedQty,
          order_count: line.orderCount,
          company_count: line.companyCount,
          prep_time_mins: line.prepTimeMins,
          line_subtotal: line.lineSubtotal,
          unit_cost_snapshot: line.unitCost,
          line_cost: line.lineCost,
        })),
      },
    },
  });

  return getPlan(plan.id);
}

export async function getPlan(planId: string) {
  actor();
  const plan = await prisma.productionPlan.findUnique({
    where: { id: planId },
    include: { lines: true },
  });
  if (!plan) throw new NotFoundError('Production plan not found');

  return {
    id: plan.id,
    date: plan.production_date.toISOString().slice(0, 10),
    status: plan.status,
    snapshotVersion: plan.snapshot_version,
    lockedAt: plan.locked_at.toISOString(),
    startedAt: plan.started_at?.toISOString() ?? null,
    completedAt: plan.completed_at?.toISOString() ?? null,
    orderCount: plan.order_count,
    companyCount: plan.company_count,
    totalPortions: plan.total_portions,
    estimatedPrepMinutes: plan.estimated_prep_minutes,
    currency: plan.currency,
    currencyMismatch: plan.currency_mismatch,
    subtotal: plan.snapshot_subtotal.toFixed(2),
    cost: plan.snapshot_cost?.toFixed(2) ?? null,
    costedPortions: plan.costed_portions,
    uncostedPortions: plan.uncosted_portions,
    lines: [...plan.lines]
      .sort(
        (a, b) =>
          (a.component_type ?? 'zz').localeCompare(b.component_type ?? 'zz') ||
          a.product_name_snapshot.localeCompare(b.product_name_snapshot),
      )
      .map((line) => ({
        productId: line.product_id,
        productName: line.product_name_snapshot,
        variantName: line.variant_name_snapshot,
        categoryName: line.category_name_snapshot,
        componentType: line.component_type,
        confirmedQty: line.confirmed_qty,
        unconfirmedQty: line.unconfirmed_qty,
        producedQty: line.produced_qty,
        plannedQty: line.planned_qty,
        orderCount: line.order_count,
        companyCount: line.company_count,
        prepTimeMins: line.prep_time_mins,
        lineSubtotal: line.line_subtotal.toFixed(2),
        lineCost: line.line_cost?.toFixed(2) ?? null,
      })),
  };
}

export async function listPlans(query: { from?: string; to?: string }) {
  actor();
  const plans = await prisma.productionPlan.findMany({
    where: {
      ...(query.from ? { production_date: { gte: new Date(`${query.from}T00:00:00.000Z`) } } : {}),
      ...(query.to ? { production_date: { lte: new Date(`${query.to}T00:00:00.000Z`) } } : {}),
    },
    orderBy: [{ production_date: 'desc' }, { snapshot_version: 'desc' }],
    take: 120,
  });

  return plans.map((plan) => ({
    id: plan.id,
    date: plan.production_date.toISOString().slice(0, 10),
    status: plan.status,
    snapshotVersion: plan.snapshot_version,
    orderCount: plan.order_count,
    companyCount: plan.company_count,
    totalPortions: plan.total_portions,
    lockedAt: plan.locked_at.toISOString(),
  }));
}

export async function setPlanStatus(
  planId: string,
  status: 'locked' | 'in_production' | 'completed' | 'cancelled',
) {
  actor();
  const plan = await prisma.productionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError('Production plan not found');

  await prisma.productionPlan.update({
    where: { id: planId },
    data: {
      status,
      ...(status === 'in_production' && !plan.started_at ? { started_at: new Date() } : {}),
      ...(status === 'completed' ? { completed_at: new Date() } : {}),
    },
  });
  return getPlan(planId);
}

/** Per-company breakdown for a day, so each delivery can be packed separately. */
export async function getDayByCompany(dateStr: string) {
  actor();
  const { start, end } = dayWindow(dateStr);

  const orders = await prisma.order.findMany({
    where: {
      is_deleted: false,
      requested_delivery_at: { gte: start, lt: end },
      workflow_instance: { current_step: { code: { in: COUNTED_STEPS } } },
    },
    select: {
      id: true,
      order_number: true,
      total_amount: true,
      fulfillment_type: true,
      company: { select: { id: true, legal_name: true } },
      workflow_instance: { select: { current_step: { select: { name: true } } } },
      items: { select: { product_name_snapshot: true, quantity: true } },
    },
    orderBy: { requested_delivery_at: 'asc' },
  });

  const byCompany = new Map<
    string,
    {
      companyId: string;
      companyName: string;
      orderCount: number;
      portions: number;
      total: Decimal;
      orders: Array<{
        id: string;
        orderNumber: string;
        status: string | null;
        fulfillmentType: string;
        items: Array<{ name: string; quantity: number }>;
      }>;
    }
  >();

  for (const order of orders) {
    const id = order.company.id;
    let entry = byCompany.get(id);
    if (!entry) {
      entry = {
        companyId: id,
        companyName: order.company.legal_name,
        orderCount: 0,
        portions: 0,
        total: new Decimal(0),
        orders: [],
      };
      byCompany.set(id, entry);
    }
    entry.orderCount += 1;
    entry.portions += order.items.reduce((sum, i) => sum + i.quantity, 0);
    entry.total = entry.total.plus(order.total_amount);
    entry.orders.push({
      id: order.id,
      orderNumber: order.order_number,
      status: order.workflow_instance?.current_step.name ?? null,
      fulfillmentType: order.fulfillment_type,
      items: order.items.map((i) => ({ name: i.product_name_snapshot, quantity: i.quantity })),
    });
  }

  return [...byCompany.values()]
    .sort((a, b) => a.companyName.localeCompare(b.companyName))
    .map((entry) => ({ ...entry, total: entry.total.toFixed(2) }));
}
