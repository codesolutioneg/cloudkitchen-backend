import { Prisma, PrismaClient } from '@prisma/client';
import { getCorrelationId, getRequestActor } from '../core/middleware/requestContext';

const AUDIT_EXCLUDED_MODELS = new Set([
  'AuditLog',
  'TimelineEvent',
  'OrderStatusHistory',
  'EntityWorkflowHistory',
  'ApprovalDecision',
  'CompanyApprovalHistory',
  'IntegrationEvent',
  'JobExecutionLog',
]);

function getModelsWithField(fieldName: string): Set<string> {
  const models = new Set<string>();
  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.fields.some((field) => field.name === fieldName)) {
      models.add(model.name);
    }
  }
  return models;
}

const SOFT_DELETE_MODELS = getModelsWithField('is_deleted');
const TENANT_SCOPED_MODELS = getModelsWithField('company_id');
/** Models where `company_id: null` means platform-global and must remain visible to company users. */
const TENANT_SCOPED_WITH_GLOBAL_NULL = new Set(['Workflow', 'ApprovalWorkflow']);
const AUDITABLE_MODELS = getModelsWithField('created_by_type');

type WhereInput = Record<string, unknown> | undefined;

function shouldAudit(model: string): boolean {
  return AUDITABLE_MODELS.has(model) && !AUDIT_EXCLUDED_MODELS.has(model);
}

function getModelDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function computeChangedFields(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): string[] {
  if (!oldValues || !newValues) {
    return [];
  }
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changed.push(key);
    }
  }
  return changed;
}

async function writeAuditLog(
  client: PrismaClient,
  params: {
    entityName: string;
    entityId: string;
    action: 'insert' | 'update' | 'delete' | 'restore';
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    changedFields?: string[];
  },
): Promise<void> {
  const actor = getRequestActor();
  const correlationId = getCorrelationId();
  if (!correlationId) {
    return;
  }

  await client.auditLog.create({
    data: {
      entity_name: params.entityName,
      entity_id: params.entityId,
      action: params.action,
      old_values: (params.oldValues ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      new_values: (params.newValues ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      changed_fields: (params.changedFields?.length
        ? params.changedFields
        : Prisma.JsonNull) as Prisma.InputJsonValue,
      changed_by_type: actor?.type ?? null,
      changed_by_id: actor?.id ?? null,
      source: 'api',
      correlation_id: correlationId,
    },
  });
}

function stripIncludeDeleted(where: WhereInput): WhereInput {
  if (!where || typeof where !== 'object') {
    return where;
  }

  const rest = { ...(where as Record<string, unknown>) };
  delete rest.includeDeleted;
  return rest;
}

function applyScoping(model: string, where: WhereInput): WhereInput {
  const actor = getRequestActor();
  const cleanedWhere = stripIncludeDeleted(where);
  const includeDeleted =
    where && typeof where === 'object'
      ? (where as { includeDeleted?: boolean }).includeDeleted === true
      : false;

  const clauses: WhereInput[] = [];

  if (cleanedWhere && Object.keys(cleanedWhere).length > 0) {
    clauses.push(cleanedWhere);
  }

  if (SOFT_DELETE_MODELS.has(model) && !includeDeleted) {
    clauses.push({ is_deleted: false });
  }

  if (TENANT_SCOPED_MODELS.has(model) && actor?.type === 'company_user' && actor.companyId) {
    if (TENANT_SCOPED_WITH_GLOBAL_NULL.has(model)) {
      clauses.push({
        OR: [{ company_id: actor.companyId }, { company_id: null }],
      });
    } else {
      clauses.push({ company_id: actor.companyId });
    }
  }

  if (clauses.length === 0) {
    return undefined;
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { AND: clauses };
}

const basePrismaClient = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export const prisma = basePrismaClient.$extends({
  query: {
    $allModels: {
      async findMany({ args, query, model }) {
        args.where = applyScoping(model, args.where as WhereInput);
        return query(args);
      },
      async findFirst({ args, query, model }) {
        args.where = applyScoping(model, args.where as WhereInput);
        return query(args);
      },
      async count({ args, query, model }) {
        args.where = applyScoping(model, args.where as WhereInput);
        return query(args);
      },
      async create({ args, query, model }) {
        const actor = getRequestActor();
        if (actor && AUDITABLE_MODELS.has(model)) {
          args.data = {
            ...args.data,
            created_by_type: actor.type,
            created_by_id: actor.id,
          };
        }

        const result = await query(args);

        if (shouldAudit(model) && result && typeof result === 'object' && 'id' in result) {
          await writeAuditLog(basePrismaClient, {
            entityName: model,
            entityId: (result as { id: string }).id,
            action: 'insert',
            newValues: toJsonRecord(result),
          });
        }

        return result;
      },
      async update({ args, query, model }) {
        const actor = getRequestActor();
        if (actor && AUDITABLE_MODELS.has(model)) {
          args.data = {
            ...args.data,
            updated_by_type: actor.type,
            updated_by_id: actor.id,
          };
        }

        let oldRecord: unknown = null;
        if (shouldAudit(model)) {
          const delegateName = getModelDelegateName(model);
          const delegate = (basePrismaClient as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[delegateName];
          if (delegate) {
            oldRecord = await delegate.findFirst({ where: args.where });
          }
        }

        const result = await query(args);

        if (shouldAudit(model) && result && typeof result === 'object' && 'id' in result) {
          const oldValues = toJsonRecord(oldRecord);
          const newValues = toJsonRecord(result);
          await writeAuditLog(basePrismaClient, {
            entityName: model,
            entityId: (result as { id: string }).id,
            action: 'update',
            oldValues,
            newValues,
            changedFields: computeChangedFields(oldValues, newValues),
          });
        }

        return result;
      },
      async updateMany({ args, query, model }) {
        const actor = getRequestActor();
        if (actor && AUDITABLE_MODELS.has(model)) {
          args.data = {
            ...args.data,
            updated_by_type: actor.type,
            updated_by_id: actor.id,
          };
        }
        return query(args);
      },
    },
  },
});

export type ExtendedPrismaClient = typeof prisma;
