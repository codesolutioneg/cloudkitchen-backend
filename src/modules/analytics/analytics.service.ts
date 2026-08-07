import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { config } from '../../config';

const CANCELLED_CODES = ['cancelled', 'refunded'];

async function resolvePlatformCurrency(): Promise<string> {
  const row = await prisma.globalSetting.findUnique({
    where: { setting_key: 'business.default_currency' },
  });
  if (row?.setting_value != null) {
    const v = row.setting_value;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'object' && v !== null && 'value' in v) {
      const nested = (v as { value: unknown }).value;
      if (nested != null && String(nested).trim()) return String(nested).trim();
    }
  }
  return config.BUSINESS_DEFAULT_CURRENCY;
}

async function resolvePlatformTimezone(): Promise<string> {
  const row = await prisma.globalSetting.findUnique({
    where: { setting_key: 'business.default_timezone' },
  });
  if (row?.setting_value != null) {
    const v = row.setting_value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return config.BUSINESS_DEFAULT_TIMEZONE;
}

function startOfDayDaysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eachDayKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export async function getAnalyticsOverview(input: { days: number; companyId?: string }) {
  const days = input.days;
  const [currency, timezone] = await Promise.all([
    resolvePlatformCurrency(),
    resolvePlatformTimezone(),
  ]);
  const rangeStart = startOfDayDaysAgo(days);
  const todayStart = startOfDayDaysAgo(1);
  const yesterdayStart = startOfDayDaysAgo(2);
  const now = new Date();

  const baseWhere: Prisma.OrderWhereInput = {
    is_deleted: false,
    created_at: { gte: rangeStart },
    ...(input.companyId ? { company_id: input.companyId } : {}),
    workflow_instance: {
      current_step: { code: { notIn: CANCELLED_CODES } },
    },
  };

  const todayWhere: Prisma.OrderWhereInput = {
    ...baseWhere,
    created_at: { gte: todayStart },
  };

  const yesterdayWhere: Prisma.OrderWhereInput = {
    is_deleted: false,
    created_at: { gte: yesterdayStart, lt: todayStart },
    ...(input.companyId ? { company_id: input.companyId } : {}),
    workflow_instance: {
      current_step: { code: { notIn: CANCELLED_CODES } },
    },
  };

  const [
    ordersInRange,
    ordersToday,
    ordersYesterday,
    activeCompanies,
    statusGroups,
    companyGroups,
  ] = await Promise.all([
    prisma.order.findMany({
      where: baseWhere,
      select: {
        id: true,
        total_amount: true,
        created_at: true,
        company_id: true,
        fulfillment_type: true,
        workflow_instance: { select: { current_step: { select: { code: true, name: true } } } },
        company: { select: { legal_name: true, trade_name: true } },
      },
      orderBy: { created_at: 'asc' },
    }),
    prisma.order.aggregate({
      where: todayWhere,
      _count: { _all: true },
      _sum: { total_amount: true },
    }),
    prisma.order.aggregate({
      where: yesterdayWhere,
      _count: { _all: true },
      _sum: { total_amount: true },
    }),
    prisma.company.count({
      where: { is_deleted: false, status: 'active', approval_status: 'approved' },
    }),
    prisma.order.groupBy({
      by: ['id'],
      where: baseWhere,
      _count: true,
    }).catch(() => [] as never[]),
    prisma.order.groupBy({
      by: ['company_id'],
      where: baseWhere,
      _count: { _all: true },
      _sum: { total_amount: true },
      orderBy: { _sum: { total_amount: 'desc' } },
      take: 8,
    }),
  ]);

  void statusGroups;

  // Status breakdown from loaded orders
  const statusMap = new Map<string, { code: string; name: string; count: number }>();
  for (const o of ordersInRange) {
    const code = o.workflow_instance?.current_step.code ?? 'unknown';
    const name = o.workflow_instance?.current_step.name ?? code;
    const cur = statusMap.get(code) ?? { code, name, count: 0 };
    cur.count += 1;
    statusMap.set(code, cur);
  }

  // Sales series (fill missing days with 0)
  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (const key of eachDayKeys(rangeStart, now)) {
    byDay.set(key, { orders: 0, revenue: 0 });
  }
  for (const o of ordersInRange) {
    const key = dayKey(o.created_at);
    const bucket = byDay.get(key) ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += Number(o.total_amount);
    byDay.set(key, bucket);
  }
  const salesSeries = [...byDay.entries()].map(([date, v]) => ({
    date,
    orders: v.orders,
    revenue: Number(v.revenue.toFixed(2)),
  }));

  const companyIds = companyGroups.map((g) => g.company_id);
  const companies = companyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, legal_name: true, trade_name: true, city: true },
      })
    : [];
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const topCompanies = companyGroups.map((g) => {
    const c = companyById.get(g.company_id);
    return {
      companyId: g.company_id,
      legalName: c?.legal_name ?? 'Unknown',
      tradeName: c?.trade_name ?? null,
      city: c?.city ?? null,
      orderCount: g._count._all,
      revenue: Number(g._sum.total_amount ?? 0).toFixed(2),
    };
  });

  const revenueToday = Number(ordersToday._sum.total_amount ?? 0);
  const revenueYesterday = Number(ordersYesterday._sum.total_amount ?? 0);
  const ordersTodayCount = ordersToday._count._all;
  const ordersYesterdayCount = ordersYesterday._count._all;

  const revenueTrendPct =
    revenueYesterday === 0 ? (revenueToday > 0 ? 100 : 0) : ((revenueToday - revenueYesterday) / revenueYesterday) * 100;
  const ordersTrendPct =
    ordersYesterdayCount === 0
      ? ordersTodayCount > 0
        ? 100
        : 0
      : ((ordersTodayCount - ordersYesterdayCount) / ordersYesterdayCount) * 100;

  const revenueInRange = ordersInRange.reduce((s, o) => s + Number(o.total_amount), 0);

  const deliveryCount = ordersInRange.filter((o) => o.fulfillment_type === 'delivery').length;
  const pickupCount = ordersInRange.filter((o) => o.fulfillment_type === 'pickup').length;

  const recentOrders = [...ordersInRange]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, 8)
    .map((o) => ({
      id: o.id,
      // order_number not selected — refetch light
    }));

  // Load recent with order numbers
  const recent = await prisma.order.findMany({
    where: baseWhere,
    orderBy: { created_at: 'desc' },
    take: 8,
    select: {
      id: true,
      order_number: true,
      total_amount: true,
      currency: true,
      fulfillment_type: true,
      created_at: true,
      company: { select: { legal_name: true, trade_name: true } },
      workflow_instance: { select: { current_step: { select: { code: true, name: true } } } },
    },
  });

  return {
    timezone,
    currency,
    days,
    companyId: input.companyId ?? null,
    kpis: {
      activeCompanies,
      ordersToday: ordersTodayCount,
      ordersTrendPct: Number(ordersTrendPct.toFixed(1)),
      revenueToday: revenueToday.toFixed(2),
      revenueTrendPct: Number(revenueTrendPct.toFixed(1)),
      ordersInRange: ordersInRange.length,
      revenueInRange: revenueInRange.toFixed(2),
      deliverySharePct:
        ordersInRange.length === 0 ? 0 : Number(((deliveryCount / ordersInRange.length) * 100).toFixed(1)),
      pickupSharePct:
        ordersInRange.length === 0 ? 0 : Number(((pickupCount / ordersInRange.length) * 100).toFixed(1)),
    },
    salesSeries,
    statusBreakdown: [...statusMap.values()].sort((a, b) => b.count - a.count),
    topCompanies,
    recentOrders: recent.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      companyName: o.company.trade_name ?? o.company.legal_name,
      totalAmount: o.total_amount.toString(),
      currency: o.currency || currency,
      fulfillmentType: o.fulfillment_type,
      statusCode: o.workflow_instance?.current_step.code ?? null,
      statusName: o.workflow_instance?.current_step.name ?? null,
      createdAt: o.created_at.toISOString(),
    })),
  };
}
