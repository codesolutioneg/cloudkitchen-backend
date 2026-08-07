import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import {
  BASE_UOM,
  costPerBaseUnit,
  dimensionOf,
  isKnownUnit,
  toBase,
  UnitConversionError,
  type Dimension,
} from '../../engines/unitConverter';
import { recipeCostEngine, NO_VARIANT_KEY } from '../../engines/recipeCostEngine';

/**
 * Ingredients, recipes and margin (§33).
 *
 * Item cost is calculated from a recipe, never typed in twice. Changing a
 * supplier price recosts everything that ingredient touches.
 */

function actor() {
  const a = getRequestActor();
  if (a?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return a;
}

function stamp() {
  const a = getRequestActor();
  return { type: a?.type ?? null, id: a?.id ?? null };
}

function wrapUnitError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof UnitConversionError) {
      throw new BadRequestError(err.message);
    }
    throw err;
  }
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function listSuppliers() {
  actor();
  const rows = await prisma.supplier.findMany({
    where: { is_deleted: false },
    orderBy: { name: 'asc' },
  });
  return rows.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    nameAr: s.name_ar,
    contactName: s.contact_name,
    phone: s.phone,
    email: s.email,
    isActive: s.is_active,
  }));
}

export async function createSupplier(input: {
  name: string;
  code?: string;
  nameAr?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}) {
  actor();
  const s = stamp();
  const created = await prisma.supplier.create({
    data: {
      name: input.name,
      code: input.code ?? null,
      name_ar: input.nameAr ?? null,
      contact_name: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? null,
      created_by_type: s.type,
      created_by_id: s.id,
    },
  });
  return { id: created.id, name: created.name };
}

// ── Ingredients ───────────────────────────────────────────────────────────────

type IngredientRow = Prisma.IngredientGetPayload<{
  include: { supplier: { select: { name: true } }; category: { select: { name: true } } };
}>;

function serializeIngredient(row: IngredientRow) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    nameAr: row.name_ar,
    categoryId: row.ingredient_category_id,
    categoryName: row.category?.name ?? null,
    supplierId: row.supplier_id,
    supplierName: row.supplier?.name ?? null,
    dimension: row.dimension,
    baseUom: row.base_uom,
    purchasePrice: row.purchase_price.toString(),
    purchaseQty: row.purchase_qty.toString(),
    purchaseUom: row.purchase_uom,
    currency: row.currency,
    yieldPercent: row.yield_percent.toString(),
    costPerBaseUnit: row.cost_per_base_unit.toString(),
    costUpdatedAt: row.cost_updated_at.toISOString(),
    isActive: row.is_active,
    notes: row.notes,
  };
}

const INGREDIENT_INCLUDE = {
  supplier: { select: { name: true } },
  category: { select: { name: true } },
} as const;

export async function listIngredients(query: {
  search?: string;
  supplierId?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}) {
  actor();
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 50, 200);

  const where: Prisma.IngredientWhereInput = {
    is_deleted: false,
    ...(query.supplierId ? { supplier_id: query.supplierId } : {}),
    ...(query.categoryId ? { ingredient_category_id: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.ingredient.findMany({
      where,
      include: INGREDIENT_INCLUDE,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ingredient.count({ where }),
  ]);

  return {
    items: items.map(serializeIngredient),
    pagination: { page, pageSize, totalItems },
  };
}

export async function getIngredient(id: string) {
  actor();
  const row = await prisma.ingredient.findFirst({
    where: { id, is_deleted: false },
    include: INGREDIENT_INCLUDE,
  });
  if (!row) throw new NotFoundError('Ingredient not found');
  return serializeIngredient(row);
}

export interface IngredientInput {
  name: string;
  nameAr?: string;
  sku?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  dimension: Dimension;
  purchasePrice: string;
  purchaseQty: string;
  purchaseUom: string;
  currency: string;
  yieldPercent?: string;
  notes?: string | null;
  isActive?: boolean;
}

export async function createIngredient(input: IngredientInput) {
  actor();
  const s = stamp();

  if (dimensionOf(input.purchaseUom) !== input.dimension) {
    throw new BadRequestError(
      `Purchase unit ${input.purchaseUom} does not belong to the ${input.dimension} dimension`,
    );
  }

  const perBase = wrapUnitError(() =>
    costPerBaseUnit({
      purchasePrice: input.purchasePrice,
      purchaseQty: input.purchaseQty,
      purchaseUom: input.purchaseUom,
      dimension: input.dimension,
      yieldPercent: input.yieldPercent ?? 100,
    }),
  );

  const created = await prisma.ingredient.create({
    data: {
      name: input.name,
      name_ar: input.nameAr ?? null,
      sku: input.sku ?? null,
      ingredient_category_id: input.categoryId ?? null,
      supplier_id: input.supplierId ?? null,
      dimension: input.dimension,
      base_uom: BASE_UOM[input.dimension],
      purchase_price: new Decimal(input.purchasePrice),
      purchase_qty: new Decimal(input.purchaseQty),
      purchase_uom: input.purchaseUom.toLowerCase(),
      currency: input.currency.toUpperCase(),
      yield_percent: new Decimal(input.yieldPercent ?? 100),
      cost_per_base_unit: perBase,
      notes: input.notes ?? null,
      is_active: input.isActive ?? true,
      created_by_type: s.type,
      created_by_id: s.id,
    },
    include: INGREDIENT_INCLUDE,
  });

  return serializeIngredient(created);
}

/**
 * Updating a price recomputes the ingredient rate, records history, and
 * recosts every product the ingredient reaches.
 *
 * Dimension and currency are locked once a recipe references the ingredient:
 * changing either would silently reinterpret every quantity already entered.
 */
export async function updateIngredient(id: string, input: Partial<IngredientInput> & { changeReason?: string }) {
  actor();
  const s = stamp();
  const existing = await prisma.ingredient.findFirst({ where: { id, is_deleted: false } });
  if (!existing) throw new NotFoundError('Ingredient not found');

  const referenced = await prisma.recipeLine.count({ where: { ingredient_id: id } });
  if (referenced > 0) {
    if (input.dimension && input.dimension !== existing.dimension) {
      throw new ConflictError(
        'This ingredient is used in a recipe, so its dimension cannot change. Create a new ingredient instead.',
      );
    }
    if (input.currency && input.currency.toUpperCase() !== existing.currency) {
      throw new ConflictError(
        'This ingredient is used in a recipe, so its currency cannot change. Create a new ingredient instead.',
      );
    }
  }

  const dimension = (input.dimension ?? existing.dimension) as Dimension;
  const purchaseUom = input.purchaseUom ?? existing.purchase_uom;
  if (dimensionOf(purchaseUom) !== dimension) {
    throw new BadRequestError(`Purchase unit ${purchaseUom} does not belong to the ${dimension} dimension`);
  }

  const purchasePrice = input.purchasePrice ? new Decimal(input.purchasePrice) : existing.purchase_price;
  const purchaseQty = input.purchaseQty ? new Decimal(input.purchaseQty) : existing.purchase_qty;
  const yieldPercent = input.yieldPercent ? new Decimal(input.yieldPercent) : existing.yield_percent;

  const perBase = wrapUnitError(() =>
    costPerBaseUnit({
      purchasePrice,
      purchaseQty,
      purchaseUom,
      dimension,
      yieldPercent,
    }),
  );

  const priceChanged = !perBase.equals(existing.cost_per_base_unit);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.ingredient.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameAr !== undefined ? { name_ar: input.nameAr } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.categoryId !== undefined ? { ingredient_category_id: input.categoryId } : {}),
        ...(input.supplierId !== undefined ? { supplier_id: input.supplierId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        dimension,
        base_uom: BASE_UOM[dimension],
        purchase_price: purchasePrice,
        purchase_qty: purchaseQty,
        purchase_uom: purchaseUom.toLowerCase(),
        yield_percent: yieldPercent,
        cost_per_base_unit: perBase,
        ...(priceChanged ? { cost_updated_at: new Date() } : {}),
        updated_by_type: s.type,
        updated_by_id: s.id,
      },
      include: INGREDIENT_INCLUDE,
    });

    // History is what keeps last month's margin honest after a price change.
    if (priceChanged) {
      await tx.ingredientPriceHistory.create({
        data: {
          ingredient_id: id,
          old_purchase_price: existing.purchase_price,
          old_purchase_qty: existing.purchase_qty,
          old_yield_percent: existing.yield_percent,
          old_cost_per_base_unit: existing.cost_per_base_unit,
          new_purchase_price: purchasePrice,
          new_purchase_qty: purchaseQty,
          purchase_uom: purchaseUom.toLowerCase(),
          new_yield_percent: yieldPercent,
          new_cost_per_base_unit: perBase,
          currency: existing.currency,
          change_percent: existing.cost_per_base_unit.isZero()
            ? null
            : perBase
                .minus(existing.cost_per_base_unit)
                .dividedBy(existing.cost_per_base_unit)
                .times(100)
                .toDecimalPlaces(4),
          change_reason: 'manual',
          note: input.changeReason ?? null,
          changed_by_type: s.type,
          changed_by_id: s.id,
        },
      });
    }

    return row;
  });

  if (priceChanged) {
    const affected = await recipeCostEngine.productsUsingIngredients([id]);
    await recipeCostEngine.refreshProductCosts(affected);
  }

  return serializeIngredient(updated);
}

export async function deleteIngredient(id: string) {
  actor();
  const referenced = await prisma.recipeLine.count({ where: { ingredient_id: id } });
  if (referenced > 0) {
    throw new ConflictError('This ingredient is used in a recipe and cannot be removed');
  }
  const existing = await prisma.ingredient.findFirst({ where: { id, is_deleted: false } });
  if (!existing) throw new NotFoundError('Ingredient not found');
  await prisma.ingredient.update({
    where: { id },
    data: { is_deleted: true, deleted_at: new Date() },
  });
}

/**
 * Applies a price change to many ingredients at once, then recosts everything
 * they touch in one pass rather than per ingredient.
 */
export async function bulkUpdatePrices(input: {
  reason?: string;
  items: Array<{ ingredientId: string; purchasePrice: string; purchaseQty?: string }>;
}) {
  actor();
  const s = stamp();
  if (input.items.length === 0) {
    throw new BadRequestError('No ingredients to update');
  }

  const batch = await prisma.ingredientPriceUpdateBatch.create({
    data: {
      source: 'manual_bulk',
      status: 'applied',
      note: input.reason ?? null,
      ingredient_count: input.items.length,
      applied_at: new Date(),
      created_by_type: s.type,
      created_by_id: s.id,
    },
  });

  const ids = input.items.map((i) => i.ingredientId);
  const existing = await prisma.ingredient.findMany({
    where: { id: { in: ids }, is_deleted: false },
  });
  const byId = new Map(existing.map((e) => [e.id, e]));

  let applied = 0;
  for (const item of input.items) {
    const row = byId.get(item.ingredientId);
    if (!row) continue;

    const purchaseQty = item.purchaseQty ? new Decimal(item.purchaseQty) : row.purchase_qty;
    const purchasePrice = new Decimal(item.purchasePrice);
    const perBase = wrapUnitError(() =>
      costPerBaseUnit({
        purchasePrice,
        purchaseQty,
        purchaseUom: row.purchase_uom,
        dimension: row.dimension as Dimension,
        yieldPercent: row.yield_percent,
      }),
    );
    if (perBase.equals(row.cost_per_base_unit)) continue;

    await prisma.$transaction([
      prisma.ingredient.update({
        where: { id: row.id },
        data: {
          purchase_price: purchasePrice,
          purchase_qty: purchaseQty,
          cost_per_base_unit: perBase,
          cost_updated_at: new Date(),
          updated_by_type: s.type,
          updated_by_id: s.id,
        },
      }),
      prisma.ingredientPriceHistory.create({
        data: {
          ingredient_id: row.id,
          batch_id: batch.id,
          old_purchase_price: row.purchase_price,
          old_purchase_qty: row.purchase_qty,
          old_yield_percent: row.yield_percent,
          old_cost_per_base_unit: row.cost_per_base_unit,
          new_purchase_price: purchasePrice,
          new_purchase_qty: purchaseQty,
          purchase_uom: row.purchase_uom,
          new_yield_percent: row.yield_percent,
          new_cost_per_base_unit: perBase,
          currency: row.currency,
          change_percent: row.cost_per_base_unit.isZero()
            ? null
            : perBase
                .minus(row.cost_per_base_unit)
                .dividedBy(row.cost_per_base_unit)
                .times(100)
                .toDecimalPlaces(4),
          change_reason: 'bulk_update',
          note: input.reason ?? null,
          changed_by_type: s.type,
          changed_by_id: s.id,
        },
      }),
    ]);
    applied += 1;
  }

  const affected = await recipeCostEngine.productsUsingIngredients(ids);
  const recost = await recipeCostEngine.refreshProductCosts(affected);

  return {
    batchId: batch.id,
    requested: input.items.length,
    applied,
    productsRecosted: recost.updated,
  };
}

export async function listPriceHistory(ingredientId: string) {
  actor();
  const rows = await prisma.ingredientPriceHistory.findMany({
    where: { ingredient_id: ingredientId },
    orderBy: { changed_at: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    changedAt: r.changed_at.toISOString(),
    oldCostPerBaseUnit: r.old_cost_per_base_unit?.toString() ?? null,
    newCostPerBaseUnit: r.new_cost_per_base_unit.toString(),
    oldPurchasePrice: r.old_purchase_price?.toString() ?? null,
    newPurchasePrice: r.new_purchase_price.toString(),
    changePercent: r.change_percent?.toString() ?? null,
    changeReason: r.change_reason,
    note: r.note,
    batchId: r.batch_id,
  }));
}

// ── Recipes ───────────────────────────────────────────────────────────────────

type RecipeRow = Prisma.RecipeGetPayload<{
  include: {
    product: { select: { name: true; currency: true } };
    lines: {
      include: {
        ingredient: { select: { name: true; base_uom: true; cost_per_base_unit: true; currency: true } };
        sub_recipe: { select: { name: true; output_base_uom: true } };
      };
    };
  };
}>;

const RECIPE_INCLUDE = {
  product: { select: { name: true, currency: true } },
  lines: {
    include: {
      ingredient: {
        select: { name: true, base_uom: true, cost_per_base_unit: true, currency: true },
      },
      sub_recipe: { select: { name: true, output_base_uom: true } },
    },
  },
} as const;

function serializeRecipe(row: RecipeRow) {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    recipeType: row.recipe_type,
    status: row.status,
    productId: row.product_id,
    productName: row.product?.name ?? null,
    variantId: row.variant_id,
    yieldQty: row.yield_qty.toString(),
    yieldUom: row.yield_uom,
    yieldBaseQty: row.yield_base_qty.toString(),
    outputDimension: row.output_dimension,
    outputBaseUom: row.output_base_uom,
    version: row.version,
    lines: [...row.lines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        id: line.id,
        ingredientId: line.ingredient_id,
        ingredientName: line.ingredient?.name ?? null,
        subRecipeId: line.sub_recipe_id,
        subRecipeName: line.sub_recipe?.name ?? null,
        quantity: line.quantity.toString(),
        uom: line.uom,
        quantityBase: line.quantity_base.toString(),
        isOptional: line.is_optional,
        sortOrder: line.sort_order,
        note: line.note,
        // Per-line cost so a chef can see which ingredient drives the plate.
        lineCost:
          line.ingredient
            ? line.quantity_base.times(line.ingredient.cost_per_base_unit).toDecimalPlaces(4).toString()
            : null,
      })),
  };
}

/** Recipe output lives in its own dimension: a batch of sauce yields millilitres, a plate yields portions. */
function outputBaseFor(uom: string): { dimension: string; baseUom: string } {
  const dim = dimensionOf(uom);
  if (!dim) return { dimension: 'portion', baseUom: 'portion' };
  return { dimension: dim, baseUom: BASE_UOM[dim] };
}

export async function listRecipes(query: { status?: string; recipeType?: string; productId?: string }) {
  actor();
  const rows = await prisma.recipe.findMany({
    where: {
      is_deleted: false,
      ...(query.status ? { status: query.status } : {}),
      ...(query.recipeType ? { recipe_type: query.recipeType } : {}),
      ...(query.productId ? { product_id: query.productId } : {}),
    },
    include: RECIPE_INCLUDE,
    orderBy: { name: 'asc' },
    take: 300,
  });
  return rows.map(serializeRecipe);
}

export async function getRecipe(id: string) {
  actor();
  const row = await prisma.recipe.findFirst({ where: { id, is_deleted: false }, include: RECIPE_INCLUDE });
  if (!row) throw new NotFoundError('Recipe not found');
  return serializeRecipe(row);
}

export interface RecipeLineInput {
  ingredientId?: string | null;
  subRecipeId?: string | null;
  quantity: string;
  uom: string;
  isOptional?: boolean;
  note?: string | null;
}

/**
 * Converts a line quantity into the child's base unit.
 *
 * The conversion happens on write so the roll-up query stays pure arithmetic.
 */
async function resolveLineBaseQty(line: RecipeLineInput): Promise<Decimal> {
  if (line.ingredientId) {
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: line.ingredientId, is_deleted: false },
      select: { dimension: true, name: true },
    });
    if (!ingredient) throw new BadRequestError('Recipe line references an unknown ingredient');
    return wrapUnitError(() => toBase(line.quantity, line.uom, ingredient.dimension as Dimension));
  }

  if (line.subRecipeId) {
    const sub = await prisma.recipe.findFirst({
      where: { id: line.subRecipeId, is_deleted: false },
      select: { output_dimension: true, output_base_uom: true, name: true },
    });
    if (!sub) throw new BadRequestError('Recipe line references an unknown sub recipe');
    if (sub.output_base_uom === 'portion') {
      // A portion is a count, so the quantity is taken as-is.
      return new Decimal(line.quantity);
    }
    return wrapUnitError(() => toBase(line.quantity, line.uom, sub.output_dimension as Dimension));
  }

  throw new BadRequestError('A recipe line must reference either an ingredient or a sub recipe');
}

export async function createRecipe(input: {
  name: string;
  nameAr?: string;
  recipeType: 'menu_item' | 'prep';
  productId?: string | null;
  variantId?: string | null;
  yieldQty: string;
  yieldUom: string;
  lines: RecipeLineInput[];
}) {
  actor();
  const s = stamp();

  if (input.recipeType === 'menu_item' && !input.productId) {
    throw new BadRequestError('A menu item recipe must be attached to a product');
  }
  if (input.recipeType === 'prep' && input.productId) {
    throw new BadRequestError('A prep recipe cannot be attached to a product');
  }

  const output = outputBaseFor(input.yieldUom);
  const yieldBase =
    output.baseUom === 'portion'
      ? new Decimal(input.yieldQty)
      : wrapUnitError(() => toBase(input.yieldQty, input.yieldUom, output.dimension as Dimension));
  if (yieldBase.lessThanOrEqualTo(0)) {
    throw new BadRequestError('Recipe yield must be greater than zero');
  }

  const lineData = [];
  for (const [index, line] of input.lines.entries()) {
    lineData.push({
      ingredient_id: line.ingredientId ?? null,
      sub_recipe_id: line.subRecipeId ?? null,
      quantity: new Decimal(line.quantity),
      uom: line.uom.toLowerCase(),
      quantity_base: await resolveLineBaseQty(line),
      is_optional: line.isOptional ?? false,
      sort_order: index,
      note: line.note ?? null,
    });
  }

  const created = await prisma.recipe.create({
    data: {
      name: input.name,
      name_ar: input.nameAr ?? null,
      recipe_type: input.recipeType,
      product_id: input.productId ?? null,
      variant_id: input.variantId ?? null,
      status: 'draft',
      yield_qty: new Decimal(input.yieldQty),
      yield_uom: input.yieldUom.toLowerCase(),
      yield_base_qty: yieldBase,
      output_dimension: output.dimension,
      output_base_uom: output.baseUom,
      created_by_type: s.type,
      created_by_id: s.id,
      lines: { create: lineData },
    },
    include: RECIPE_INCLUDE,
  });

  return serializeRecipe(created);
}

export async function replaceRecipeLines(recipeId: string, lines: RecipeLineInput[]) {
  actor();
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, is_deleted: false } });
  if (!recipe) throw new NotFoundError('Recipe not found');

  const lineData = [];
  for (const [index, line] of lines.entries()) {
    lineData.push({
      recipe_id: recipeId,
      ingredient_id: line.ingredientId ?? null,
      sub_recipe_id: line.subRecipeId ?? null,
      quantity: new Decimal(line.quantity),
      uom: line.uom.toLowerCase(),
      quantity_base: await resolveLineBaseQty(line),
      is_optional: line.isOptional ?? false,
      sort_order: index,
      note: line.note ?? null,
    });
  }

  await prisma.$transaction([
    prisma.recipeLine.deleteMany({ where: { recipe_id: recipeId } }),
    prisma.recipeLine.createMany({ data: lineData }),
    prisma.recipe.update({ where: { id: recipeId }, data: { version: { increment: 1 } } }),
  ]);

  if (recipe.status === 'active' && recipe.product_id) {
    await recipeCostEngine.refreshProductCosts([
      { productId: recipe.product_id, variantId: recipe.variant_id },
    ]);
  }

  return getRecipe(recipeId);
}

/**
 * Activating validates the whole exploded tree first: an active recipe is what
 * margin reporting trusts, so it must not go live half-costed.
 */
export async function setRecipeStatus(recipeId: string, status: 'draft' | 'active' | 'archived') {
  actor();
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, is_deleted: false } });
  if (!recipe) throw new NotFoundError('Recipe not found');

  if (status === 'active') {
    const [cost] = await recipeCostEngine.computeRecipeCosts([recipeId]);
    if (!cost || cost.status !== 'ok') {
      throw new ConflictError(
        `This recipe cannot go live yet: ${cost?.status ?? 'no_recipe'}. Fix the recipe first.`,
      );
    }
  }

  await prisma.recipe.update({ where: { id: recipeId }, data: { status } });

  if (recipe.product_id) {
    await recipeCostEngine.refreshProductCosts([
      { productId: recipe.product_id, variantId: recipe.variant_id },
    ]);
  }
  return getRecipe(recipeId);
}

// ── Margin ────────────────────────────────────────────────────────────────────

/**
 * Cost against selling price for every product that has a cost row.
 *
 * Margin is derived here, never stored: the selling price moves independently
 * of the cost, and a stored margin would be stale the moment either changes.
 */
export async function listProductCosts(query: { page?: number; pageSize?: number; costStatus?: string }) {
  actor();
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 50, 200);

  const where: Prisma.ProductCostWhereInput = {
    ...(query.costStatus ? { cost_status: query.costStatus } : {}),
  };

  const [rows, totalItems] = await Promise.all([
    prisma.productCost.findMany({
      where,
      include: {
        product: { select: { name: true, base_price: true, currency: true } },
        variant: { select: { variant_name: true, price_adjustment: true } },
      },
      orderBy: { computed_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.productCost.count({ where }),
  ]);

  const items = rows.map((row) => {
    const base = row.product?.base_price ?? null;
    const sellingPrice = base
      ? base.plus(row.variant?.price_adjustment ?? new Decimal(0))
      : null;
    const cost = row.total_cost;
    const marginValue =
      row.is_costed && sellingPrice ? sellingPrice.minus(cost) : null;
    const marginPercent =
      marginValue && sellingPrice && sellingPrice.greaterThan(0)
        ? marginValue.dividedBy(sellingPrice).times(100).toDecimalPlaces(2)
        : null;

    return {
      productId: row.product_id,
      productName: row.product?.name ?? null,
      variantId: row.variant_id,
      variantName: row.variant?.variant_name ?? null,
      currency: row.currency,
      foodCost: row.food_cost.toString(),
      packagingCost: row.packaging_cost.toString(),
      totalCost: cost.toString(),
      sellingPrice: sellingPrice?.toString() ?? null,
      marginValue: marginValue?.toString() ?? null,
      marginPercent: marginPercent?.toString() ?? null,
      isCosted: row.is_costed,
      costStatus: row.cost_status,
      computedFrom: row.computed_from,
      computedAt: row.computed_at.toISOString(),
    };
  });

  return { items, pagination: { page, pageSize, totalItems } };
}

/** Coverage tells the business how far to trust any margin report at all. */
export async function getCostingSummary() {
  actor();
  const [sellable, costRows] = await Promise.all([
    prisma.product.count({ where: { is_deleted: false, is_active: true } }),
    prisma.productCost.groupBy({ by: ['cost_status'], _count: { _all: true } }),
  ]);

  const byStatus = Object.fromEntries(costRows.map((r) => [r.cost_status, r._count._all]));
  const costed = byStatus.ok ?? 0;
  const overridden = byStatus.manual_override ?? 0;
  const trusted = costed + overridden;

  return {
    sellableProducts: sellable,
    costedProducts: trusted,
    coveragePercent: sellable === 0 ? '0.00' : ((trusted / sellable) * 100).toFixed(2),
    byStatus,
  };
}

/** A hand-entered cost for a dish nobody has a recipe for yet. */
export async function setManualCost(
  productId: string,
  input: { variantId?: string | null; foodCost: string; packagingCost?: string; currency?: string },
) {
  actor();
  const product = await prisma.product.findFirst({
    where: { id: productId, is_deleted: false },
    select: { currency: true },
  });
  if (!product) throw new NotFoundError('Product not found');

  const variantKey = input.variantId ?? NO_VARIANT_KEY;
  const foodCost = new Decimal(input.foodCost);
  const packaging = new Decimal(input.packagingCost ?? 0);
  const values = {
    currency: (input.currency ?? product.currency).toUpperCase(),
    food_cost: foodCost,
    packaging_cost: packaging,
    total_cost: foodCost.plus(packaging),
    manual_food_cost: foodCost,
    is_costed: true,
    cost_status: 'manual_override',
    computed_from: 'manual_override',
    computed_at: new Date(),
  };

  await prisma.productCost.upsert({
    where: { product_id_variant_key: { product_id: productId, variant_key: variantKey } },
    create: { product_id: productId, variant_id: input.variantId ?? null, variant_key: variantKey, ...values },
    update: values,
  });

  return listProductCosts({ page: 1, pageSize: 1, costStatus: 'manual_override' });
}

/** Recost everything. Intended for the nightly job and a manual admin button. */
export async function recostAll() {
  actor();
  return recipeCostEngine.refreshProductCosts();
}
