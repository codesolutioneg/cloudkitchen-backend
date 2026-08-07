/**
 * Food cost roll-up (§33).
 *
 * Explodes a recipe tree down to raw ingredients and materialises the result in
 * product_costs, so margin reads are a single indexed lookup rather than a
 * recursive walk per row.
 *
 * Set-based on purpose. Costing every menu item after a supplier price change
 * is one query, not one query per item.
 *
 * Nothing here ever writes products.base_price or product_prices. Selling price
 * and food cost are independent numbers; the business decides the first and the
 * kitchen measures the second.
 */

import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../prisma/client';

/** product_costs.variant_key uses this in place of NULL so the unique index works. */
export const NO_VARIANT_KEY = '00000000-0000-0000-0000-000000000000';

/** How deep a recipe may nest before we refuse to trust the number. */
export const MAX_RECIPE_DEPTH = 5;

export type CostStatus =
  | 'ok'
  | 'no_recipe'
  | 'missing_ingredient'
  | 'depth_exceeded'
  | 'currency_conflict'
  | 'manual_override';

export interface RecipeCostRow {
  recipeId: string;
  totalCost: Decimal;
  lineCount: number;
  missingIngredients: number;
  currencyCount: number;
  truncated: boolean;
  status: CostStatus;
  isCosted: boolean;
}

interface RawRow {
  root_recipe_id: string;
  total_cost: string | null;
  missing: bigint | number;
  currency_count: bigint | number;
  truncated: boolean | null;
  line_count: bigint | number;
}

function toNumber(value: bigint | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/**
 * Derives the trustworthiness of a computed cost.
 *
 * Order matters: a recipe that is both too deep and missing an ingredient is
 * reported as too deep, because that is the problem to fix first.
 */
function deriveStatus(row: {
  lineCount: number;
  truncated: boolean;
  currencyCount: number;
  missing: number;
}): { status: CostStatus; isCosted: boolean } {
  if (row.lineCount === 0) return { status: 'no_recipe', isCosted: false };
  if (row.truncated) return { status: 'depth_exceeded', isCosted: false };
  if (row.currencyCount > 1) return { status: 'currency_conflict', isCosted: false };
  if (row.missing > 0) return { status: 'missing_ingredient', isCosted: false };
  return { status: 'ok', isCosted: true };
}

/**
 * Costs a set of recipes in one pass.
 *
 * Optional lines are excluded: an optional extra is not part of the standard
 * portion cost, and including it would overstate every margin.
 *
 * @param recipeIds Recipes to cost. Unknown ids come back as `no_recipe`.
 * @returns One row per requested id, in no particular order.
 */
export async function computeRecipeCosts(recipeIds: string[]): Promise<RecipeCostRow[]> {
  if (recipeIds.length === 0) return [];

  const rows = await prisma.$queryRaw<RawRow[]>`
    WITH RECURSIVE exploded AS (
      SELECT r.id AS root_recipe_id,
             rl.ingredient_id,
             rl.sub_recipe_id,
             -- Cast so the anchor matches the unconstrained numeric the
             -- recursive term produces after dividing by the child yield.
             rl.quantity_base::numeric AS qty,
             1 AS depth
      FROM recipes r
      JOIN recipe_lines rl ON rl.recipe_id = r.id
      WHERE r.id = ANY(${recipeIds}::uuid[]) AND rl.is_optional = false
      UNION ALL
      SELECT e.root_recipe_id,
             rl.ingredient_id,
             rl.sub_recipe_id,
             e.qty * rl.quantity_base / NULLIF(child.yield_base_qty, 0),
             e.depth + 1
      FROM exploded e
      JOIN recipes child ON child.id = e.sub_recipe_id AND child.is_deleted = false
      JOIN recipe_lines rl ON rl.recipe_id = child.id AND rl.is_optional = false
      WHERE e.depth < ${MAX_RECIPE_DEPTH}
    )
    SELECT roots.id AS root_recipe_id,
           COALESCE(SUM(e.qty * i.cost_per_base_unit) FILTER (WHERE i.id IS NOT NULL), 0) AS total_cost,
           COUNT(*) FILTER (WHERE e.ingredient_id IS NOT NULL AND i.id IS NULL) AS missing,
           COUNT(DISTINCT i.currency) AS currency_count,
           COALESCE(BOOL_OR(e.depth = ${MAX_RECIPE_DEPTH} AND e.sub_recipe_id IS NOT NULL), false) AS truncated,
           COUNT(e.root_recipe_id) AS line_count
    FROM unnest(${recipeIds}::uuid[]) AS roots(id)
    LEFT JOIN exploded e ON e.root_recipe_id = roots.id
    LEFT JOIN ingredients i ON i.id = e.ingredient_id AND i.is_deleted = false
    GROUP BY roots.id
  `;

  return rows.map((row) => {
    const lineCount = toNumber(row.line_count);
    const missing = toNumber(row.missing);
    const currencyCount = toNumber(row.currency_count);
    const truncated = row.truncated === true;
    const { status, isCosted } = deriveStatus({ lineCount, truncated, currencyCount, missing });
    return {
      recipeId: row.root_recipe_id,
      totalCost: new Decimal(row.total_cost ?? 0),
      lineCount,
      missingIngredients: missing,
      currencyCount,
      truncated,
      status,
      isCosted,
    };
  });
}

/**
 * Recomputes and stores product_costs for the given sellables.
 *
 * A manual override is never overwritten: someone entered that number
 * deliberately, and a nightly recompute silently replacing it would be worse
 * than having no automation at all.
 *
 * @param targets Product and variant pairs to refresh. Empty means every
 *   sellable that has an active menu-item recipe.
 * @returns How many cost rows were written.
 */
export async function refreshProductCosts(
  targets?: Array<{ productId: string; variantId: string | null }>,
): Promise<{ updated: number; costed: number }> {
  const recipes = await prisma.recipe.findMany({
    where: {
      recipe_type: 'menu_item',
      status: 'active',
      is_deleted: false,
      product_id: { not: null },
      ...(targets && targets.length > 0
        ? { OR: targets.map((t) => ({ product_id: t.productId, variant_id: t.variantId })) }
        : {}),
    },
    select: {
      id: true,
      product_id: true,
      variant_id: true,
      yield_base_qty: true,
      // Cost is stored in the currency the product sells in, because that is
      // the only pairing where a margin percentage means anything.
      product: { select: { currency: true } },
    },
  });

  if (recipes.length === 0) return { updated: 0, costed: 0 };

  const costs = await computeRecipeCosts(recipes.map((r) => r.id));
  const byRecipe = new Map(costs.map((c) => [c.recipeId, c]));

  // One read for every existing cost row, not one per recipe.
  const productIds = [...new Set(recipes.map((r) => r.product_id).filter((id): id is string => !!id))];
  const existingRows = await prisma.productCost.findMany({
    where: { product_id: { in: productIds } },
    select: {
      product_id: true,
      variant_key: true,
      computed_from: true,
      packaging_cost: true,
    },
  });
  const existingByKey = new Map(
    existingRows.map((row) => [`${row.product_id}:${row.variant_key}`, row]),
  );

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  let updated = 0;
  let costed = 0;

  for (const recipe of recipes) {
    const cost = byRecipe.get(recipe.id);
    if (!cost || !recipe.product_id) continue;

    const variantKey = recipe.variant_id ?? NO_VARIANT_KEY;
    const existing = existingByKey.get(`${recipe.product_id}:${variantKey}`);

    // A human-entered cost wins over anything computed.
    if (existing?.computed_from === 'manual_override') continue;

    // The roll-up is for the whole recipe yield; cost is per portion.
    const yieldQty = recipe.yield_base_qty.lessThanOrEqualTo(0)
      ? new Decimal(1)
      : recipe.yield_base_qty;
    const foodCost = cost.totalCost.dividedBy(yieldQty).toDecimalPlaces(4);
    const packaging = existing?.packaging_cost ?? new Decimal(0);

    const values = {
      recipe_id: recipe.id,
      currency: recipe.product?.currency ?? 'EGP',
      food_cost: foodCost,
      packaging_cost: packaging,
      total_cost: foodCost.plus(packaging),
      is_costed: cost.isCosted,
      cost_status: cost.status,
      computed_from: 'recipe',
      computed_at: new Date(),
      missing_ingredient_count: cost.missingIngredients,
    };

    writes.push(
      prisma.productCost.upsert({
        where: {
          product_id_variant_key: { product_id: recipe.product_id, variant_key: variantKey },
        },
        create: {
          product_id: recipe.product_id,
          variant_id: recipe.variant_id,
          variant_key: variantKey,
          ...values,
        },
        update: values,
      }),
    );

    updated += 1;
    if (cost.isCosted) costed += 1;
  }

  if (writes.length > 0) {
    await prisma.$transaction(writes);
  }

  return { updated, costed };
}

/**
 * Every sellable touched by a set of ingredients, so a price change can
 * recost exactly what it affects rather than the whole catalog.
 */
export async function productsUsingIngredients(
  ingredientIds: string[],
): Promise<Array<{ productId: string; variantId: string | null }>> {
  if (ingredientIds.length === 0) return [];

  const rows = await prisma.$queryRaw<Array<{ product_id: string; variant_id: string | null }>>`
    WITH RECURSIVE affected AS (
      SELECT rl.recipe_id
      FROM recipe_lines rl
      WHERE rl.ingredient_id = ANY(${ingredientIds}::uuid[])
      UNION
      SELECT rl.recipe_id
      FROM recipe_lines rl
      JOIN affected a ON rl.sub_recipe_id = a.recipe_id
    )
    SELECT DISTINCT r.product_id, r.variant_id
    FROM recipes r
    JOIN affected a ON a.recipe_id = r.id
    WHERE r.recipe_type = 'menu_item'
      AND r.status = 'active'
      AND r.is_deleted = false
      AND r.product_id IS NOT NULL
  `;

  return rows.map((r) => ({ productId: r.product_id, variantId: r.variant_id }));
}

/**
 * Cost snapshots for order lines, so an order records what it cost to make at
 * the time it was placed rather than at the time someone reads the report.
 */
export async function snapshotCostsForProducts(
  keys: Array<{ productId: string; variantId?: string | null }>,
): Promise<Map<string, { totalCost: Decimal; isCosted: boolean; computedFrom: string }>> {
  const result = new Map<string, { totalCost: Decimal; isCosted: boolean; computedFrom: string }>();
  if (keys.length === 0) return result;

  const rows = await prisma.productCost.findMany({
    where: {
      OR: keys.map((k) => ({
        product_id: k.productId,
        variant_key: k.variantId ?? NO_VARIANT_KEY,
      })),
    },
    select: {
      product_id: true,
      variant_key: true,
      total_cost: true,
      is_costed: true,
      computed_from: true,
    },
  });

  for (const row of rows) {
    result.set(`${row.product_id}:${row.variant_key}`, {
      totalCost: row.total_cost,
      isCosted: row.is_costed,
      computedFrom: row.computed_from,
    });
  }
  return result;
}

export const recipeCostEngine = {
  computeRecipeCosts,
  refreshProductCosts,
  productsUsingIngredients,
  snapshotCostsForProducts,
  NO_VARIANT_KEY,
};
