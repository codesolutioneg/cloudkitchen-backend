import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';

export interface ListAuditLogsQuery {
  entityName?: string;
  entityId?: string;
  correlationId?: string;
  page?: number;
  pageSize?: number;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  Company: 'شركة',
  CompanyAddress: 'عنوان شركة',
  CompanyUser: 'مستخدم شركة',
  DashboardUser: 'مستخدم لوحة',
  Order: 'طلب',
  Product: 'منتج',
  Category: 'فئة',
  Role: 'دور',
  BusinessRule: 'قاعدة عمل',
};

function pickLabelFromJson(values: unknown): string | null {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const v = values as Record<string, unknown>;
  for (const key of [
    'legal_name',
    'trade_name',
    'name',
    'email',
    'order_number',
    'title',
    'label',
    'sku',
    'code',
  ]) {
    const val = v[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}

function serializeAuditLog(row: {
  id: string;
  entity_name: string;
  entity_id: string;
  action: string;
  old_values: Prisma.JsonValue;
  new_values: Prisma.JsonValue;
  changed_fields: Prisma.JsonValue;
  changed_by_type: string | null;
  changed_by_id: string | null;
  changed_at: Date;
  reason: string | null;
  source: string;
  correlation_id: string;
  request_id: string | null;
}) {
  const recordLabel =
    pickLabelFromJson(row.new_values) ?? pickLabelFromJson(row.old_values);
  const entityTypeLabel = ENTITY_TYPE_LABELS[row.entity_name] ?? row.entity_name;

  return {
    id: row.id,
    entityName: row.entity_name,
    entityId: row.entity_id,
    entityTypeLabel,
    entityLabel: recordLabel,
    entityDisplay: recordLabel ? `${entityTypeLabel}: ${recordLabel}` : entityTypeLabel,
    action: row.action,
    oldValues: row.old_values,
    newValues: row.new_values,
    changedFields: row.changed_fields,
    changedByType: row.changed_by_type,
    changedById: row.changed_by_id,
    actorDisplay: null as string | null,
    changedAt: row.changed_at.toISOString(),
    reason: row.reason,
    source: row.source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
  };
}

type SerializedAuditLog = ReturnType<typeof serializeAuditLog>;

async function enrichEntityLabels(items: SerializedAuditLog[]) {
  const needCompany = new Set<string>();
  const needOrder = new Set<string>();
  const needProduct = new Set<string>();
  const needRole = new Set<string>();

  for (const item of items) {
    if (item.entityLabel) continue;
    switch (item.entityName) {
      case 'Company':
        needCompany.add(item.entityId);
        break;
      case 'Order':
        needOrder.add(item.entityId);
        break;
      case 'Product':
        needProduct.add(item.entityId);
        break;
      case 'Role':
        needRole.add(item.entityId);
        break;
      default:
        break;
    }
  }

  const [companies, orders, products, roles] = await Promise.all([
    needCompany.size
      ? prisma.company.findMany({
          where: { id: { in: [...needCompany] } },
          select: { id: true, legal_name: true, trade_name: true },
        })
      : [],
    needOrder.size
      ? prisma.order.findMany({
          where: { id: { in: [...needOrder] } },
          select: { id: true, order_number: true },
        })
      : [],
    needProduct.size
      ? prisma.product.findMany({
          where: { id: { in: [...needProduct] } },
          select: { id: true, name: true },
        })
      : [],
    needRole.size
      ? prisma.role.findMany({
          where: { id: { in: [...needRole] } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const companyMap = new Map(
    companies.map((c) => [c.id, c.legal_name || c.trade_name || null]),
  );
  const orderMap = new Map(orders.map((o) => [o.id, o.order_number]));
  const productMap = new Map(products.map((p) => [p.id, p.name]));
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  for (const item of items) {
    if (item.entityLabel) continue;
    let label: string | null = null;
    switch (item.entityName) {
      case 'Company':
        label = companyMap.get(item.entityId) ?? null;
        break;
      case 'Order':
        label = orderMap.get(item.entityId) ?? null;
        break;
      case 'Product':
        label = productMap.get(item.entityId) ?? null;
        break;
      case 'Role':
        label = roleMap.get(item.entityId) ?? null;
        break;
      default:
        break;
    }
    if (label) {
      item.entityLabel = label;
      item.entityDisplay = `${item.entityTypeLabel}: ${label}`;
    }
  }
}

async function enrichActorLabels(items: SerializedAuditLog[]) {
  const dashboardIds = new Set<string>();
  const companyIds = new Set<string>();

  for (const item of items) {
    if (!item.changedById) {
      if (item.changedByType === 'system') item.actorDisplay = 'النظام';
      continue;
    }
    if (item.changedByType === 'dashboard_user') dashboardIds.add(item.changedById);
    if (item.changedByType === 'company_user') companyIds.add(item.changedById);
  }

  const [dashboardUsers, companyUsers] = await Promise.all([
    dashboardIds.size
      ? prisma.dashboardUser.findMany({
          where: { id: { in: [...dashboardIds] } },
          select: { id: true, email: true, full_name: true },
        })
      : [],
    companyIds.size
      ? prisma.companyUser.findMany({
          where: { id: { in: [...companyIds] } },
          select: { id: true, email: true, full_name: true },
        })
      : [],
  ]);

  const dashMap = new Map(
    dashboardUsers.map((u) => [u.id, u.full_name?.trim() || u.email]),
  );
  const companyMap = new Map(
    companyUsers.map((u) => [u.id, u.full_name?.trim() || u.email]),
  );

  for (const item of items) {
    if (item.actorDisplay) continue;
    if (!item.changedByType) {
      item.actorDisplay = '—';
      continue;
    }
    if (item.changedByType === 'system') {
      item.actorDisplay = 'النظام';
      continue;
    }
    if (item.changedByType === 'dashboard_user' && item.changedById) {
      item.actorDisplay = dashMap.get(item.changedById) ?? 'مستخدم لوحة';
      continue;
    }
    if (item.changedByType === 'company_user' && item.changedById) {
      item.actorDisplay = companyMap.get(item.changedById) ?? 'مستخدم شركة';
      continue;
    }
    item.actorDisplay = item.changedByType;
  }
}

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {
    ...(query.entityName ? { entity_name: query.entityName } : {}),
    ...(query.entityId ? { entity_id: query.entityId } : {}),
    ...(query.correlationId ? { correlation_id: query.correlationId } : {}),
  };

  const [rows, totalItems] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { changed_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const items = rows.map(serializeAuditLog);
  await enrichEntityLabels(items);
  await enrichActorLabels(items);

  return {
    items,
    pagination: { page, pageSize, totalItems },
  };
}
