import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';

export interface ListAuditLogsQuery {
  entityName?: string;
  entityId?: string;
  correlationId?: string;
  page?: number;
  pageSize?: number;
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
  return {
    id: row.id,
    entityName: row.entity_name,
    entityId: row.entity_id,
    action: row.action,
    oldValues: row.old_values,
    newValues: row.new_values,
    changedFields: row.changed_fields,
    changedByType: row.changed_by_type,
    changedById: row.changed_by_id,
    changedAt: row.changed_at.toISOString(),
    reason: row.reason,
    source: row.source,
    correlationId: row.correlation_id,
    requestId: row.request_id,
  };
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

  const [items, totalItems] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { changed_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: items.map(serializeAuditLog),
    pagination: { page, pageSize, totalItems },
  };
}
