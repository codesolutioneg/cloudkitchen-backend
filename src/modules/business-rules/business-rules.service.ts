import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { NotFoundError, ConflictError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';
import { businessRuleResolver } from '../../engines/businessRuleResolver';

type ScopeType = 'platform' | 'company' | 'department' | 'user' | 'product' | 'category';

function serializeRuleType(rt: {
  id: string;
  code: string;
  name: string;
  value_schema: Prisma.JsonValue;
}) {
  return {
    id: rt.id,
    code: rt.code,
    name: rt.name,
    valueSchema: rt.value_schema,
  };
}

function serializeBusinessRule(rule: {
  id: string;
  rule_type_id: string;
  scope_type: string;
  scope_id: string | null;
  value: Prisma.JsonValue;
  priority: number;
  effective_from: Date;
  effective_to: Date | null;
  notes: string | null;
  version: number;
  rule_type?: { code: string; name: string };
}) {
  return {
    id: rule.id,
    ruleTypeId: rule.rule_type_id,
    ruleTypeCode: rule.rule_type?.code,
    ruleTypeName: rule.rule_type?.name,
    scopeType: rule.scope_type,
    scopeId: rule.scope_id,
    value: rule.value,
    priority: rule.priority,
    effectiveFrom: rule.effective_from.toISOString(),
    effectiveTo: rule.effective_to?.toISOString() ?? null,
    notes: rule.notes,
    version: rule.version,
  };
}

function serializeCalendar(cal: {
  id: string;
  name: string;
  country_code: string | null;
  company_id: string | null;
}) {
  return {
    id: cal.id,
    name: cal.name,
    countryCode: cal.country_code,
    companyId: cal.company_id,
  };
}

function serializeCalendarEvent(ev: {
  id: string;
  calendar_id: string;
  event_date: Date;
  event_type: string;
  name: string;
  metadata: Prisma.JsonValue;
}) {
  return {
    id: ev.id,
    calendarId: ev.calendar_id,
    eventDate: ev.event_date.toISOString().slice(0, 10),
    eventType: ev.event_type,
    name: ev.name,
    metadata: ev.metadata,
  };
}

async function invalidateRuleCache(ruleTypeId: string): Promise<void> {
  const rt = await prisma.ruleType.findUnique({ where: { id: ruleTypeId } });
  if (rt) {
    await businessRuleResolver.invalidate(rt.code);
  }
}

// ── Rule types ────────────────────────────────────────────────────────────────

export async function listRuleTypes() {
  const rows = await prisma.ruleType.findMany({ orderBy: { code: 'asc' } });
  return rows.map(serializeRuleType);
}

export async function createRuleType(input: {
  code: string;
  name: string;
  valueSchema?: Record<string, unknown>;
}) {
  try {
    const row = await prisma.ruleType.create({
      data: {
        code: input.code,
        name: input.name,
        value_schema: input.valueSchema ?? Prisma.JsonNull,
      },
    });
    return serializeRuleType(row);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Rule type code already exists');
    }
    throw err;
  }
}

export async function updateRuleType(
  id: string,
  input: { name?: string; valueSchema?: Record<string, unknown> | null },
) {
  const existing = await prisma.ruleType.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Rule type not found');
  }
  const row = await prisma.ruleType.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.valueSchema !== undefined
        ? { value_schema: input.valueSchema === null ? Prisma.JsonNull : input.valueSchema }
        : {}),
    },
  });
  return serializeRuleType(row);
}

// ── Business rules ────────────────────────────────────────────────────────────

export async function listBusinessRules(query?: {
  ruleTypeCode?: string;
  scopeType?: string;
}) {
  const where: Prisma.BusinessRuleWhereInput = {};
  if (query?.ruleTypeCode) {
    where.rule_type = { code: query.ruleTypeCode };
  }
  if (query?.scopeType) {
    where.scope_type = query.scopeType;
  }

  const rows = await prisma.businessRule.findMany({
    where,
    include: { rule_type: true },
    orderBy: [{ priority: 'desc' }, { effective_from: 'desc' }],
  });
  return rows.map(serializeBusinessRule);
}

export async function createBusinessRule(input: {
  ruleTypeId: string;
  scopeType: ScopeType;
  scopeId?: string;
  value: unknown;
  priority?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  notes?: string;
}) {
  const row = await prisma.businessRule.create({
    data: {
      rule_type_id: input.ruleTypeId,
      scope_type: input.scopeType,
      scope_id: input.scopeId ?? null,
      value: input.value as Prisma.InputJsonValue,
      priority: input.priority ?? 0,
      effective_from: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
      effective_to: input.effectiveTo ? new Date(input.effectiveTo) : null,
      notes: input.notes ?? null,
    },
    include: { rule_type: true },
  });
  await invalidateRuleCache(input.ruleTypeId);
  return serializeBusinessRule(row);
}

export async function updateBusinessRule(
  id: string,
  input: {
    scopeType?: ScopeType;
    scopeId?: string | null;
    value?: unknown;
    priority?: number;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    notes?: string | null;
    version?: number;
  },
) {
  const existing = await prisma.businessRule.findFirst({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Business rule not found');
  }

  if (input.version !== undefined && input.version !== existing.version) {
    throw new ConflictError('Business rule was modified — reload and retry');
  }

  const row = await prisma.businessRule.update({
    where: { id },
    data: {
      ...(input.scopeType !== undefined ? { scope_type: input.scopeType } : {}),
      ...(input.scopeId !== undefined ? { scope_id: input.scopeId } : {}),
      ...(input.value !== undefined ? { value: input.value as Prisma.InputJsonValue } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.effectiveFrom !== undefined
        ? { effective_from: new Date(input.effectiveFrom) }
        : {}),
      ...(input.effectiveTo !== undefined
        ? { effective_to: input.effectiveTo ? new Date(input.effectiveTo) : null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      version: { increment: 1 },
    },
    include: { rule_type: true },
  });
  await invalidateRuleCache(existing.rule_type_id);
  return serializeBusinessRule(row);
}

export async function deleteBusinessRule(id: string) {
  const existing = await prisma.businessRule.findFirst({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Business rule not found');
  }
  await prisma.businessRule.update({
    where: { id },
    data: { is_deleted: true, deleted_at: new Date() },
  });
  await invalidateRuleCache(existing.rule_type_id);
}

export async function resolveBusinessRule(query: {
  ruleTypeCode: string;
  companyId: string;
  departmentId?: string;
  userId?: string;
  productId?: string;
  categoryId?: string;
}) {
  const value = await businessRuleResolver.resolve({
    ruleTypeCode: query.ruleTypeCode,
    companyId: query.companyId,
    departmentId: query.departmentId,
    userId: query.userId,
    productId: query.productId,
    categoryId: query.categoryId,
  });
  return { ruleTypeCode: query.ruleTypeCode, value };
}

// ── Calendars ─────────────────────────────────────────────────────────────────

export async function listCalendars(query?: { companyId?: string }) {
  const where: Prisma.CalendarWhereInput = {};
  if (query?.companyId) {
    where.OR = [{ company_id: query.companyId }, { company_id: null }];
  }
  const rows = await prisma.calendar.findMany({
    where,
    orderBy: { name: 'asc' },
  });
  return rows.map(serializeCalendar);
}

export async function createCalendar(input: {
  name: string;
  countryCode?: string;
  companyId?: string;
}) {
  const row = await prisma.calendar.create({
    data: {
      name: input.name,
      country_code: input.countryCode ?? null,
      company_id: input.companyId ?? null,
    },
  });
  return serializeCalendar(row);
}

export async function updateCalendar(
  id: string,
  input: { name?: string; countryCode?: string | null; companyId?: string | null },
) {
  const existing = await prisma.calendar.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Calendar not found');
  }
  const row = await prisma.calendar.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.countryCode !== undefined ? { country_code: input.countryCode } : {}),
      ...(input.companyId !== undefined ? { company_id: input.companyId } : {}),
    },
  });
  return serializeCalendar(row);
}

export async function listCalendarEvents(calendarId: string) {
  const cal = await prisma.calendar.findUnique({ where: { id: calendarId } });
  if (!cal) {
    throw new NotFoundError('Calendar not found');
  }
  const rows = await prisma.calendarEvent.findMany({
    where: { calendar_id: calendarId },
    orderBy: { event_date: 'asc' },
  });
  return rows.map(serializeCalendarEvent);
}

export async function createCalendarEvent(
  calendarId: string,
  input: {
    eventDate: string;
    eventType: 'holiday' | 'blackout' | 'special_hours';
    name: string;
    metadata?: Record<string, unknown>;
  },
) {
  const cal = await prisma.calendar.findUnique({ where: { id: calendarId } });
  if (!cal) {
    throw new NotFoundError('Calendar not found');
  }
  const row = await prisma.calendarEvent.create({
    data: {
      calendar_id: calendarId,
      event_date: new Date(input.eventDate),
      event_type: input.eventType,
      name: input.name,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
  return serializeCalendarEvent(row);
}

export async function updateCalendarEvent(
  calendarId: string,
  eventId: string,
  input: {
    eventDate?: string;
    eventType?: 'holiday' | 'blackout' | 'special_hours';
    name?: string;
    metadata?: Record<string, unknown> | null;
  },
) {
  const existing = await prisma.calendarEvent.findFirst({
    where: { id: eventId, calendar_id: calendarId },
  });
  if (!existing) {
    throw new NotFoundError('Calendar event not found');
  }
  const row = await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...(input.eventDate !== undefined ? { event_date: new Date(input.eventDate) } : {}),
      ...(input.eventType !== undefined ? { event_type: input.eventType } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.metadata !== undefined
        ? { metadata: input.metadata === null ? Prisma.JsonNull : input.metadata }
        : {}),
    },
  });
  return serializeCalendarEvent(row);
}
