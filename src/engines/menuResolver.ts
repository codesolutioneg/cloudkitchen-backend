import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../prisma/client';

export interface ResolvedPrice {
  price: Decimal;
  currency: string;
  source: 'company_pricing_list' | 'default_pricing_list' | 'base_price';
  pricingListId?: string;
}

/**
 * Resolves the effective catalog_menu_id for a company user scope (§13).
 * Priority: highest `priority`, then most recent `effective_from`.
 */
export async function resolveEffectiveMenu(
  companyId: string,
  departmentId?: string | null,
  userId?: string | null,
  atInstant = new Date(),
): Promise<string | null> {
  const scopeClauses: Array<{ scope_type: string; scope_id: string }> = [
    { scope_type: 'company', scope_id: companyId },
  ];
  if (departmentId) {
    scopeClauses.push({ scope_type: 'department', scope_id: departmentId });
  }
  if (userId) {
    scopeClauses.push({ scope_type: 'user', scope_id: userId });
  }

  const assignments = await prisma.menuAssignment.findMany({
    where: {
      AND: [
        { is_active: true },
        { effective_from: { lte: atInstant } },
        { OR: [{ effective_to: null }, { effective_to: { gt: atInstant } }] },
        { OR: scopeClauses },
      ],
    },
    orderBy: [{ priority: 'desc' }, { effective_from: 'desc' }],
    take: 1,
  });

  return assignments[0]?.catalog_menu_id ?? null;
}

/**
 * Company-tiered pricing: company assignment wins over default list (§13).
 */
export async function resolveProductPrice(
  companyId: string,
  productId: string,
  variantId?: string | null,
  atInstant = new Date(),
): Promise<ResolvedPrice> {
  const product = await prisma.product.findFirst({
    where: { id: productId, is_deleted: false },
  });
  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  const companyAssignment = await prisma.companyPricingListAssignment.findFirst({
    where: {
      company_id: companyId,
      effective_from: { lte: atInstant },
      OR: [{ effective_to: null }, { effective_to: { gt: atInstant } }],
    },
    orderBy: { effective_from: 'desc' },
  });

  let pricingListId = companyAssignment?.pricing_list_id;
  let source: ResolvedPrice['source'] = 'company_pricing_list';

  if (!pricingListId) {
    const defaultList = await prisma.productPricingList.findFirst({
      where: { is_default: true },
    });
    pricingListId = defaultList?.id;
    source = 'default_pricing_list';
  }

  if (pricingListId) {
    const tieredPrice = await prisma.productPrice.findFirst({
      where: {
        pricing_list_id: pricingListId,
        product_id: productId,
        variant_id: variantId ?? null,
        effective_from: { lte: atInstant },
        OR: [{ effective_to: null }, { effective_to: { gt: atInstant } }],
      },
      orderBy: { effective_from: 'desc' },
      include: { pricing_list: true },
    });

    if (tieredPrice) {
      return {
        price: tieredPrice.price,
        currency: tieredPrice.pricing_list.currency,
        source,
        pricingListId,
      };
    }
  }

  return {
    price: product.base_price,
    currency: product.currency,
    source: 'base_price',
  };
}

export const menuResolver = {
  resolveEffectiveMenu,
  resolveProductPrice,
};
