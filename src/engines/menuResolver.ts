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
 * Which pricing list applies to a company right now: an active company
 * assignment wins over the platform default list (§13).
 */
export async function resolveEffectivePricingList(
  companyId: string,
  atInstant = new Date(),
): Promise<{ pricingListId?: string; source: ResolvedPrice['source'] }> {
  const companyAssignment = await prisma.companyPricingListAssignment.findFirst({
    where: {
      company_id: companyId,
      effective_from: { lte: atInstant },
      OR: [{ effective_to: null }, { effective_to: { gt: atInstant } }],
    },
    orderBy: { effective_from: 'desc' },
  });

  if (companyAssignment) {
    return { pricingListId: companyAssignment.pricing_list_id, source: 'company_pricing_list' };
  }

  const defaultList = await prisma.productPricingList.findFirst({
    where: { is_default: true },
  });
  return { pricingListId: defaultList?.id, source: 'default_pricing_list' };
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

  const { pricingListId, source } = await resolveEffectivePricingList(companyId, atInstant);

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

/**
 * Batch form of {@link resolveProductPrice} for planners and bulk quoting:
 * one query for the list price of many products instead of one per product.
 *
 * @param pricingListId Pricing list to read, already resolved by the caller.
 * @param productIds Products to price (base-variant price only).
 * @returns Map of product id to list price for the products the list covers.
 */
export async function resolveListPrices(
  pricingListId: string | undefined,
  productIds: string[],
  atInstant = new Date(),
): Promise<Map<string, Decimal>> {
  const prices = new Map<string, Decimal>();
  if (!pricingListId || productIds.length === 0) {
    return prices;
  }

  const rows = await prisma.productPrice.findMany({
    where: {
      pricing_list_id: pricingListId,
      product_id: { in: productIds },
      variant_id: null,
      effective_from: { lte: atInstant },
      OR: [{ effective_to: null }, { effective_to: { gt: atInstant } }],
    },
    orderBy: { effective_from: 'asc' },
  });

  // Ascending order means the latest effective row overwrites earlier ones.
  for (const row of rows) {
    prices.set(row.product_id, row.price);
  }

  return prices;
}

export const menuResolver = {
  resolveEffectiveMenu,
  resolveEffectivePricingList,
  resolveProductPrice,
  resolveListPrices,
};
