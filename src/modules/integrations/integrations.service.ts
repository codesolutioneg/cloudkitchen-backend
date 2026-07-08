import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { NotFoundError, ConflictError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';

function serializeSystem(row: {
  id: string;
  code: string;
  name: string;
  system_type: string;
  base_url: string | null;
  is_active: boolean;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    systemType: row.system_type,
    baseUrl: row.base_url,
    isActive: row.is_active,
  };
}

function serializeMapping(row: {
  id: string;
  entity_type: string;
  entity_id: string;
  external_id: string;
  sync_status: string;
  external_sku: string | null;
  is_synced: boolean;
}) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    externalId: row.external_id,
    syncStatus: row.sync_status,
    externalSku: row.external_sku,
    isSynced: row.is_synced,
  };
}

function serializeEvent(row: {
  id: string;
  event_code: string;
  entity_type: string;
  entity_id: string;
  status: string;
  occurred_at: Date;
  retry_count: number;
}) {
  return {
    id: row.id,
    eventCode: row.event_code,
    entityType: row.entity_type,
    entityId: row.entity_id,
    status: row.status,
    occurredAt: row.occurred_at.toISOString(),
    retryCount: row.retry_count,
  };
}

export async function listExternalSystems() {
  const rows = await prisma.externalSystem.findMany({ orderBy: { code: 'asc' } });
  return rows.map(serializeSystem);
}

export async function createExternalSystem(input: {
  code: string;
  name: string;
  systemType: string;
  baseUrl?: string;
  authConfig?: Record<string, unknown>;
  isActive?: boolean;
}) {
  try {
    const row = await prisma.externalSystem.create({
      data: {
        code: input.code,
        name: input.name,
        system_type: input.systemType,
        base_url: input.baseUrl ?? null,
        auth_config: input.authConfig ?? Prisma.JsonNull,
        is_active: input.isActive ?? false,
      },
    });
    return serializeSystem(row);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('External system code already exists');
    }
    throw err;
  }
}

export async function updateExternalSystem(
  systemId: string,
  input: {
    name?: string;
    systemType?: string;
    baseUrl?: string | null;
    authConfig?: Record<string, unknown> | null;
    isActive?: boolean;
  },
) {
  const existing = await prisma.externalSystem.findUnique({ where: { id: systemId } });
  if (!existing) {
    throw new NotFoundError('External system not found');
  }

  const row = await prisma.externalSystem.update({
    where: { id: systemId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.systemType !== undefined ? { system_type: input.systemType } : {}),
      ...(input.baseUrl !== undefined ? { base_url: input.baseUrl } : {}),
      ...(input.authConfig !== undefined
        ? { auth_config: input.authConfig ?? Prisma.JsonNull }
        : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    },
  });
  return serializeSystem(row);
}

export async function listSystemMappings(systemId: string) {
  const system = await prisma.externalSystem.findUnique({ where: { id: systemId } });
  if (!system) {
    throw new NotFoundError('External system not found');
  }

  const rows = await prisma.externalSystemMapping.findMany({
    where: { external_system_id: systemId },
    orderBy: { entity_type: 'asc' },
  });
  return rows.map(serializeMapping);
}

export async function listIntegrationEvents(query: {
  status?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.IntegrationEventWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.entityType ? { entity_type: query.entityType } : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.integrationEvent.findMany({
      where,
      orderBy: { occurred_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.integrationEvent.count({ where }),
  ]);

  return {
    items: items.map(serializeEvent),
    pagination: { page, pageSize, totalItems },
  };
}
