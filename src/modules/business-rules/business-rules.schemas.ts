import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { registry, SuccessEnvelopeSchema } from '../../core/openapi/registry';

extendZodWithOpenApi(z);

export const idParamsSchema = z.object({ id: z.string().uuid() });
export const calendarEventParamsSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
});

const scopeTypeSchema = z.enum([
  'platform',
  'company',
  'department',
  'user',
  'product',
  'category',
]);

export const ruleTypeSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    valueSchema: z.unknown().nullable(),
  })
  .openapi('RuleType');

export const createRuleTypeSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  valueSchema: z.record(z.unknown()).optional(),
});

export const updateRuleTypeSchema = createRuleTypeSchema
  .omit({ code: true })
  .partial()
  .extend({
    valueSchema: z.record(z.unknown()).nullable().optional(),
  });

export const businessRuleSchema = z
  .object({
    id: z.string().uuid(),
    ruleTypeId: z.string().uuid(),
    ruleTypeCode: z.string().optional(),
    ruleTypeName: z.string().optional(),
    scopeType: scopeTypeSchema,
    scopeId: z.string().uuid().nullable(),
    value: z.unknown(),
    priority: z.number().int(),
    effectiveFrom: z.string(),
    effectiveTo: z.string().nullable(),
    notes: z.string().nullable(),
    version: z.number().int(),
  })
  .openapi('BusinessRule');

export const createBusinessRuleSchema = z.object({
  ruleTypeId: z.string().uuid(),
  scopeType: scopeTypeSchema,
  scopeId: z.string().uuid().optional(),
  value: z.unknown(),
  priority: z.number().int().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const updateBusinessRuleSchema = createBusinessRuleSchema
  .omit({ ruleTypeId: true })
  .partial()
  .extend({
    scopeId: z.string().uuid().nullable().optional(),
    effectiveTo: z.string().datetime().nullable().optional(),
    notes: z.string().nullable().optional(),
    version: z.number().int().optional(),
  });

export const listBusinessRulesQuerySchema = z.object({
  ruleTypeCode: z.string().optional(),
  scopeType: scopeTypeSchema.optional(),
});

export const resolveBusinessRuleQuerySchema = z.object({
  ruleTypeCode: z.string().min(1),
  companyId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});

export const calendarSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    countryCode: z.string().nullable(),
    companyId: z.string().uuid().nullable(),
  })
  .openapi('Calendar');

export const createCalendarSchema = z.object({
  name: z.string().min(1).max(150),
  countryCode: z.string().length(2).optional(),
  companyId: z.string().uuid().optional(),
});

export const updateCalendarSchema = createCalendarSchema.partial().extend({
  countryCode: z.string().length(2).nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
});

export const listCalendarsQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
});

export const calendarEventSchema = z
  .object({
    id: z.string().uuid(),
    calendarId: z.string().uuid(),
    eventDate: z.string(),
    eventType: z.enum(['holiday', 'blackout', 'special_hours']),
    name: z.string(),
    metadata: z.unknown().nullable(),
  })
  .openapi('CalendarEvent');

export const createCalendarEventSchema = z.object({
  eventDate: z.string(),
  eventType: z.enum(['holiday', 'blackout', 'special_hours']),
  name: z.string().min(1).max(150),
  metadata: z.record(z.unknown()).optional(),
});

export const updateCalendarEventSchema = createCalendarEventSchema.partial().extend({
  metadata: z.record(z.unknown()).nullable().optional(),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/rules/rule-types',
  tags: ['Business Rules'],
  summary: 'List rule types',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Rule type list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(ruleTypeSchema)) },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/rules/business-rules/resolve',
  tags: ['Business Rules'],
  summary: 'Resolve a business rule for testing',
  security: [{ dashboardBearerAuth: [] }],
  request: { query: resolveBusinessRuleQuerySchema },
  responses: { 200: { description: 'Resolved rule value' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/rules/calendars',
  tags: ['Business Rules'],
  summary: 'List calendars',
  security: [{ dashboardBearerAuth: [] }],
  responses: {
    200: {
      description: 'Calendar list',
      content: {
        'application/json': { schema: SuccessEnvelopeSchema(z.array(calendarSchema)) },
      },
    },
  },
});
