import { prisma } from '../prisma/client';
import { cacheDeleteByPrefix, cacheGet, cacheSet } from '../core/utils/cache';

type ScopeType = 'platform' | 'company' | 'department' | 'user' | 'product' | 'category';

/** Tie-break when priority is equal: higher specificity wins (Appendix C). */
const SCOPE_SPECIFICITY: Record<ScopeType, number> = {
  user: 4,
  product: 4,
  department: 3,
  category: 3,
  company: 2,
  platform: 1,
};

export interface ResolveBusinessRuleParams {
  ruleTypeCode: string;
  companyId: string;
  departmentId?: string;
  userId?: string;
  productId?: string;
  categoryId?: string;
  atInstant?: Date;
}

function buildCacheKey(params: ResolveBusinessRuleParams & { atInstant: Date }): string {
  return [
    'rule',
    params.ruleTypeCode,
    params.companyId,
    params.departmentId ?? '',
    params.userId ?? '',
    params.productId ?? '',
    params.categoryId ?? '',
    params.atInstant.toISOString(),
  ].join(':');
}

async function resolveBusinessRuleUncached(
  params: ResolveBusinessRuleParams & { atInstant: Date },
): Promise<unknown | null> {
  const candidates = await prisma.businessRule.findMany({
    where: {
      rule_type: { code: params.ruleTypeCode },
      effective_from: { lte: params.atInstant },
      OR: [{ effective_to: null }, { effective_to: { gt: params.atInstant } }],
      AND: [
        {
          OR: [
            { scope_type: 'platform' },
            { scope_type: 'company', scope_id: params.companyId },
            ...(params.departmentId
              ? [{ scope_type: 'department', scope_id: params.departmentId }]
              : []),
            ...(params.userId ? [{ scope_type: 'user', scope_id: params.userId }] : []),
            ...(params.productId
              ? [{ scope_type: 'product', scope_id: params.productId }]
              : []),
            ...(params.categoryId
              ? [{ scope_type: 'category', scope_id: params.categoryId }]
              : []),
          ],
        },
      ],
    },
    include: { rule_type: true },
  });

  const winner = candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return (
      SCOPE_SPECIFICITY[b.scope_type as ScopeType] -
      SCOPE_SPECIFICITY[a.scope_type as ScopeType]
    );
  })[0];

  return winner?.value ?? null;
}

export const businessRuleResolver = {
  async resolve(params: ResolveBusinessRuleParams): Promise<unknown | null> {
    const atInstant = params.atInstant ?? new Date();
    const cacheKey = buildCacheKey({ ...params, atInstant });
    const cached = await cacheGet<unknown | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const value = await resolveBusinessRuleUncached({ ...params, atInstant });
    await cacheSet(cacheKey, value);
    return value;
  },

  async invalidate(ruleTypeCode: string): Promise<void> {
    await cacheDeleteByPrefix(`rule:${ruleTypeCode}:`);
  },

  async invalidateAll(): Promise<void> {
    await cacheDeleteByPrefix('rule:');
  },
};
