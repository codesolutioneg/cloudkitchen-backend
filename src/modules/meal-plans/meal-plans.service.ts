import { FulfillmentType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import { getDashboardCompanyScopeFilter } from '../../engines/companyScopeResolver';
import { menuResolver } from '../../engines/menuResolver';
import * as ordersService from '../orders/orders.service';
import {
  buildMealPlan,
  enumerateDates,
  evaluateDayWarnings,
  type CandidateProduct,
  type ComponentType,
  type LockedPick,
  type NutritionTargets,
  type PlanResult,
  type PlanWarning,
  type SlotSpec,
} from '../../engines/mealPlanOptimizer';

const PLAN_MAX_DAYS = 92;

/** A solver candidate plus the catalog fields the dashboard listing shows. */
interface CatalogCandidate extends CandidateProduct {
  categoryId: string;
  currency: string;
}

type PlanStatus = 'draft' | 'generated' | 'approved' | 'archived';

export interface PlanBriefInput {
  companyId: string;
  startDate: string;
  endDate: string;
  headcount: number;
  budgetPerMeal: string;
  pricingListId?: string | null;
  sourceMenuId?: string | null;
  slots: SlotSpec[];
  excludeAllergens?: string[];
  varietyWindowDays?: number;
  minCaloriesKcal?: number | null;
  maxCaloriesKcal?: number | null;
  minProteinG?: number | null;
  maxProteinG?: number | null;
  minCarbsG?: number | null;
  maxCarbsG?: number | null;
  maxFatG?: number | null;
}

// ── Serialization ─────────────────────────────────────────────────────────────

function dec(value: Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseSlots(value: Prisma.JsonValue): SlotSpec[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const componentType = record.componentType;
    const quantity = record.quantity;
    if (typeof componentType !== 'string' || typeof quantity !== 'number') return [];
    return [{ componentType: componentType as ComponentType, quantity }];
  });
}

function parseWarnings(value: Prisma.JsonValue | null): PlanWarning[] {
  return Array.isArray(value) ? (value as unknown as PlanWarning[]) : [];
}

type PlanRow = Prisma.MealPlanGetPayload<{ include: { company: { select: { legal_name: true } } } }>;

function serializePlan(plan: PlanRow) {
  return {
    id: plan.id,
    companyId: plan.company_id,
    companyName: plan.company?.legal_name ?? null,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    startDate: isoDate(plan.start_date),
    endDate: isoDate(plan.end_date),
    headcount: plan.headcount,
    budgetPerMeal: plan.budget_per_meal.toString(),
    currency: plan.currency,
    pricingListId: plan.pricing_list_id,
    sourceMenuId: plan.source_menu_id,
    minCaloriesKcal: dec(plan.min_calories_kcal),
    maxCaloriesKcal: dec(plan.max_calories_kcal),
    minProteinG: dec(plan.min_protein_g),
    maxProteinG: dec(plan.max_protein_g),
    minCarbsG: dec(plan.min_carbs_g),
    maxCarbsG: dec(plan.max_carbs_g),
    maxFatG: dec(plan.max_fat_g),
    slots: parseSlots(plan.slot_spec),
    excludeAllergens: plan.exclude_allergens,
    varietyWindowDays: plan.variety_window_days,
    generatedAt: plan.generated_at?.toISOString() ?? null,
    isFeasible: plan.is_feasible,
    warnings: parseWarnings(plan.warnings),
    totalCost: plan.total_cost.toString(),
    avgCostPerMeal: plan.avg_cost_per_meal.toString(),
    avgCaloriesKcal: plan.avg_calories_kcal.toString(),
    avgProteinG: plan.avg_protein_g.toString(),
    avgCarbsG: plan.avg_carbs_g.toString(),
    avgFatG: plan.avg_fat_g.toString(),
    approvedAt: plan.approved_at?.toISOString() ?? null,
    createdAt: plan.created_at.toISOString(),
  };
}

type ItemRow = Prisma.MealPlanItemGetPayload<{ include: { product: { select: { name: true } } } }>;

function serializeItem(item: ItemRow) {
  return {
    id: item.id,
    productId: item.product_id,
    variantId: item.variant_id,
    productName: item.product?.name ?? null,
    componentType: item.component_type,
    quantity: item.quantity,
    unitPrice: item.unit_price.toString(),
    lineTotal: item.line_total.toString(),
    caloriesKcal: item.calories_kcal.toString(),
    proteinG: item.protein_g.toString(),
    carbsG: item.carbs_g.toString(),
    fatG: item.fat_g.toString(),
    isLocked: item.is_locked,
    sortOrder: item.sort_order,
  };
}

type DayRow = Prisma.MealPlanDayGetPayload<{
  include: { items: { include: { product: { select: { name: true } } } } };
}>;

function serializeDay(day: DayRow) {
  return {
    id: day.id,
    planDate: isoDate(day.plan_date),
    sortOrder: day.sort_order,
    costPerHead: day.cost_per_head.toString(),
    totalCost: day.total_cost.toString(),
    caloriesKcal: day.calories_kcal.toString(),
    proteinG: day.protein_g.toString(),
    carbsG: day.carbs_g.toString(),
    fatG: day.fat_g.toString(),
    isFeasible: day.is_feasible,
    warnings: parseWarnings(day.warnings),
    items: [...day.items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(serializeItem),
  };
}

// ── Candidate resolution ──────────────────────────────────────────────────────

/**
 * Products the planner may pick: active, priced, and carrying nutrition data.
 *
 * @param companyId Buying company, used to resolve tiered pricing.
 * @param sourceMenuId Optional catalog menu that narrows the candidate pool.
 * @param pricingListId Explicit pricing list; falls back to the company's.
 * @returns Candidates with per-serving price and macros.
 */
export async function resolveCandidates(
  companyId: string,
  sourceMenuId?: string | null,
  pricingListId?: string | null,
  atInstant = new Date(),
): Promise<CatalogCandidate[]> {
  let productFilter: Prisma.ProductWhereInput = {
    is_deleted: false,
    is_active: true,
    nutrition: { isNot: null },
  };

  // Without an explicit source menu, plan from the company's own assigned menu.
  // Anything else would let the planner pick products the company cannot order,
  // and the plan would only fail at confirmation.
  const menuId =
    sourceMenuId ?? (await menuResolver.resolveEffectiveMenu(companyId, null, null, atInstant));

  if (menuId) {
    productFilter = {
      ...productFilter,
      catalog_menu_products: {
        some: { section: { catalog_menu_id: menuId } },
      },
    };
  }

  const products = await prisma.product.findMany({
    where: productFilter,
    include: { nutrition: true },
    orderBy: { name: 'asc' },
  });

  if (products.length === 0) return [];

  const effectiveListId =
    pricingListId ??
    (await menuResolver.resolveEffectivePricingList(companyId, atInstant)).pricingListId;

  const listPrices = await menuResolver.resolveListPrices(
    effectiveListId,
    products.map((product) => product.id),
    atInstant,
  );

  return products.flatMap((product) => {
    const nutrition = product.nutrition;
    if (!nutrition) return [];
    // A custom product awaiting approval carries no price, so there is nothing
    // to budget against and it cannot be planned.
    const price = listPrices.get(product.id) ?? product.base_price;
    if (price === null) return [];
    return [
      {
        productId: product.id,
        variantId: null,
        name: product.name,
        componentType: nutrition.component_type as ComponentType,
        unitPrice: Number(price),
        caloriesKcal: Number(nutrition.calories_kcal),
        proteinG: Number(nutrition.protein_g),
        carbsG: Number(nutrition.carbs_g),
        fatG: Number(nutrition.fat_g),
        allergens: nutrition.allergens,
        categoryId: product.category_id,
        currency: product.currency,
      },
    ];
  });
}

export async function listCandidates(input: {
  companyId: string;
  sourceMenuId?: string;
  pricingListId?: string;
  componentType?: ComponentType;
}) {
  await assertCompanyExists(input.companyId);

  const candidates = await resolveCandidates(
    input.companyId,
    input.sourceMenuId ?? null,
    input.pricingListId ?? null,
  );

  return candidates
    .filter((candidate) => !input.componentType || candidate.componentType === input.componentType)
    .map((candidate) => ({
      productId: candidate.productId,
      name: candidate.name,
      categoryId: candidate.categoryId,
      componentType: candidate.componentType,
      unitPrice: candidate.unitPrice.toFixed(2),
      currency: candidate.currency,
      caloriesKcal: candidate.caloriesKcal.toFixed(2),
      proteinG: candidate.proteinG.toFixed(2),
      carbsG: candidate.carbsG.toFixed(2),
      fatG: candidate.fatG.toFixed(2),
      allergens: candidate.allergens,
      // "Protein per riyal": the number a canteen buyer actually negotiates on.
      proteinPerCurrencyUnit:
        candidate.unitPrice > 0 ? (candidate.proteinG / candidate.unitPrice).toFixed(2) : '0.00',
    }));
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function targetsOf(plan: {
  min_calories_kcal: Decimal | null;
  max_calories_kcal: Decimal | null;
  min_protein_g: Decimal | null;
  max_protein_g: Decimal | null;
  min_carbs_g: Decimal | null;
  max_carbs_g: Decimal | null;
  max_fat_g: Decimal | null;
}): NutritionTargets {
  const num = (value: Decimal | null) => (value === null ? null : Number(value));
  return {
    minCaloriesKcal: num(plan.min_calories_kcal),
    maxCaloriesKcal: num(plan.max_calories_kcal),
    minProteinG: num(plan.min_protein_g),
    maxProteinG: num(plan.max_protein_g),
    minCarbsG: num(plan.min_carbs_g),
    maxCarbsG: num(plan.max_carbs_g),
    maxFatG: num(plan.max_fat_g),
  };
}

function targetColumns(input: Partial<PlanBriefInput>) {
  const set = (value: number | null | undefined) =>
    value === undefined ? undefined : value === null ? null : new Decimal(value);
  return {
    min_calories_kcal: set(input.minCaloriesKcal),
    max_calories_kcal: set(input.maxCaloriesKcal),
    min_protein_g: set(input.minProteinG),
    max_protein_g: set(input.maxProteinG),
    min_carbs_g: set(input.minCarbsG),
    max_carbs_g: set(input.maxCarbsG),
    max_fat_g: set(input.maxFatG),
  };
}

function getDashboardActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return actor;
}

function actorColumns() {
  const actor = getRequestActor();
  return {
    type: actor?.type ?? null,
    id: actor?.id ?? null,
  };
}

/**
 * A dashboard user restricted to a set of companies must not read or edit
 * another company's meal plan. Users scoped to `all` pass through.
 */
async function assertCompanyInScope(companyId: string): Promise<void> {
  const actor = getDashboardActorOrThrow();
  const scope = await getDashboardCompanyScopeFilter(actor.id);
  if (scope && !scope.id.in.includes(companyId)) {
    throw new ForbiddenError('This company is outside your assigned scope');
  }
}

function assertDateRange(startDate: string, endDate: string): void {
  const days = enumerateDates(startDate, endDate, PLAN_MAX_DAYS + 1);
  if (days.length === 0) {
    throw new BadRequestError('endDate must be on or after startDate');
  }
  if (days.length > PLAN_MAX_DAYS) {
    throw new BadRequestError(`A meal plan cannot span more than ${PLAN_MAX_DAYS} days`);
  }
}

async function assertCompanyExists(companyId: string): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
    select: { id: true },
  });
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  await assertCompanyInScope(companyId);
}

export async function listPlans(query: {
  companyId?: string;
  status?: PlanStatus;
  page?: number;
  pageSize?: number;
  dashboardUserId?: string;
}) {
  getDashboardActorOrThrow();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;

  const companyScope = query.dashboardUserId
    ? await getDashboardCompanyScopeFilter(query.dashboardUserId)
    : undefined;

  const where: Prisma.MealPlanWhereInput = {
    is_deleted: false,
    ...(query.companyId ? { company_id: query.companyId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(companyScope ? { company: companyScope } : {}),
  };

  const [rows, totalItems] = await Promise.all([
    prisma.mealPlan.findMany({
      where,
      include: { company: { select: { legal_name: true } } },
      orderBy: [{ created_at: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mealPlan.count({ where }),
  ]);

  return { items: rows.map(serializePlan), pagination: { page, pageSize, totalItems } };
}

/**
 * Fetches a plan without any authorisation check.
 *
 * For internal recomputation only, where the caller has already established
 * that this actor may touch this plan. Entry points must use
 * {@link loadPlanOrThrow} (dashboard) or loadCompanyPlanOrThrow (company).
 */
async function loadPlanRow(planId: string) {
  const plan = await prisma.mealPlan.findFirst({
    where: { id: planId, is_deleted: false },
    include: { company: { select: { legal_name: true } } },
  });
  if (!plan) {
    throw new NotFoundError('Meal plan not found');
  }
  return plan;
}

async function loadPlanOrThrow(planId: string) {
  const plan = await loadPlanRow(planId);
  await assertCompanyInScope(plan.company_id);
  return plan;
}

export async function getPlan(planId: string) {
  const plan = await loadPlanOrThrow(planId);
  const days = await prisma.mealPlanDay.findMany({
    where: { meal_plan_id: planId },
    include: { items: { include: { product: { select: { name: true } } } } },
    orderBy: { plan_date: 'asc' },
  });
  return { ...serializePlan(plan), days: days.map(serializeDay) };
}

export async function createPlan(input: PlanBriefInput & { name: string; description?: string; currency: string }) {
  await assertCompanyExists(input.companyId);
  return createPlanRecord(input);
}

/** Shared by the dashboard and the company self-service path. Assumes the caller authorised the company. */
async function createPlanRecord(input: PlanBriefInput & { name: string; description?: string; currency: string }) {
  assertDateRange(input.startDate, input.endDate);

  const actor = actorColumns();
  const plan = await prisma.mealPlan.create({
    data: {
      company_id: input.companyId,
      name: input.name,
      description: input.description ?? null,
      status: 'draft',
      start_date: new Date(`${input.startDate}T00:00:00.000Z`),
      end_date: new Date(`${input.endDate}T00:00:00.000Z`),
      headcount: input.headcount,
      budget_per_meal: new Decimal(input.budgetPerMeal),
      currency: input.currency.toUpperCase(),
      pricing_list_id: input.pricingListId ?? null,
      source_menu_id: input.sourceMenuId ?? null,
      slot_spec: input.slots as unknown as Prisma.InputJsonValue,
      exclude_allergens: input.excludeAllergens ?? [],
      variety_window_days: input.varietyWindowDays ?? 2,
      ...targetColumns(input),
      created_by_type: actor.type,
      created_by_id: actor.id,
    },
    include: { company: { select: { legal_name: true } } },
  });

  return serializePlan(plan);
}

export async function updatePlan(planId: string, input: Partial<PlanBriefInput> & { name?: string; description?: string | null; currency?: string }) {
  const existing = await loadPlanOrThrow(planId);
  if (existing.status === 'approved') {
    throw new ConflictError('An approved meal plan cannot be edited; duplicate it instead');
  }

  const startDate = input.startDate ?? isoDate(existing.start_date);
  const endDate = input.endDate ?? isoDate(existing.end_date);
  assertDateRange(startDate, endDate);

  const actor = actorColumns();
  const plan = await prisma.mealPlan.update({
    where: { id: planId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.startDate !== undefined
        ? { start_date: new Date(`${input.startDate}T00:00:00.000Z`) }
        : {}),
      ...(input.endDate !== undefined
        ? { end_date: new Date(`${input.endDate}T00:00:00.000Z`) }
        : {}),
      ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
      ...(input.budgetPerMeal !== undefined
        ? { budget_per_meal: new Decimal(input.budgetPerMeal) }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
      ...(input.pricingListId !== undefined ? { pricing_list_id: input.pricingListId } : {}),
      ...(input.sourceMenuId !== undefined ? { source_menu_id: input.sourceMenuId } : {}),
      ...(input.slots !== undefined
        ? { slot_spec: input.slots as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.excludeAllergens !== undefined
        ? { exclude_allergens: input.excludeAllergens }
        : {}),
      ...(input.varietyWindowDays !== undefined
        ? { variety_window_days: input.varietyWindowDays }
        : {}),
      ...targetColumns(input),
      updated_by_type: actor.type,
      updated_by_id: actor.id,
      version: { increment: 1 },
    },
    include: { company: { select: { legal_name: true } } },
  });

  return serializePlan(plan);
}

export async function archivePlan(planId: string) {
  await loadPlanOrThrow(planId);
  const actor = actorColumns();
  await prisma.mealPlan.update({
    where: { id: planId },
    data: {
      status: 'archived',
      is_deleted: true,
      deleted_at: new Date(),
      updated_by_type: actor.type,
      updated_by_id: actor.id,
    },
  });
}

export async function approvePlan(planId: string) {
  const plan = await loadPlanOrThrow(planId);
  if (plan.status !== 'generated') {
    throw new ConflictError('Only a generated meal plan can be approved');
  }

  const actor = actorColumns();
  const approved = await prisma.mealPlan.update({
    where: { id: planId },
    data: {
      status: 'approved',
      approved_at: new Date(),
      approved_by: actor.type === 'dashboard_user' ? actor.id : null,
      updated_by_type: actor.type,
      updated_by_id: actor.id,
    },
    include: { company: { select: { legal_name: true } } },
  });

  return serializePlan(approved);
}

export async function duplicatePlan(planId: string) {
  const plan = await loadPlanOrThrow(planId);
  const actor = actorColumns();

  const copy = await prisma.mealPlan.create({
    data: {
      company_id: plan.company_id,
      name: `${plan.name} (copy)`.slice(0, 180),
      description: plan.description,
      status: 'draft',
      start_date: plan.start_date,
      end_date: plan.end_date,
      headcount: plan.headcount,
      budget_per_meal: plan.budget_per_meal,
      currency: plan.currency,
      pricing_list_id: plan.pricing_list_id,
      source_menu_id: plan.source_menu_id,
      slot_spec: plan.slot_spec as Prisma.InputJsonValue,
      exclude_allergens: plan.exclude_allergens,
      variety_window_days: plan.variety_window_days,
      min_calories_kcal: plan.min_calories_kcal,
      max_calories_kcal: plan.max_calories_kcal,
      min_protein_g: plan.min_protein_g,
      max_protein_g: plan.max_protein_g,
      min_carbs_g: plan.min_carbs_g,
      max_carbs_g: plan.max_carbs_g,
      max_fat_g: plan.max_fat_g,
      created_by_type: actor.type,
      created_by_id: actor.id,
    },
    include: { company: { select: { legal_name: true } } },
  });

  return serializePlan(copy);
}

// ── Generation ────────────────────────────────────────────────────────────────

async function solveBrief(
  brief: {
    companyId: string;
    startDate: string;
    endDate: string;
    headcount: number;
    budgetPerMeal: string;
    pricingListId?: string | null;
    sourceMenuId?: string | null;
    slots: SlotSpec[];
    excludeAllergens: string[];
    varietyWindowDays: number;
    targets: NutritionTargets;
  },
  lockedPicks: LockedPick[] = [],
): Promise<{ dates: string[]; result: PlanResult }> {
  const dates = enumerateDates(brief.startDate, brief.endDate, PLAN_MAX_DAYS);
  if (dates.length === 0) {
    throw new BadRequestError('endDate must be on or after startDate');
  }

  const candidates = await resolveCandidates(
    brief.companyId,
    brief.sourceMenuId ?? null,
    brief.pricingListId ?? null,
  );

  const result = buildMealPlan({
    dates,
    headcount: brief.headcount,
    budgetPerMeal: Number(brief.budgetPerMeal),
    slots: brief.slots,
    targets: brief.targets,
    excludeAllergens: brief.excludeAllergens,
    varietyWindowDays: brief.varietyWindowDays,
    lockedPicks,
    candidates,
  });

  return { dates, result };
}

export async function previewPlan(input: PlanBriefInput) {
  await assertCompanyExists(input.companyId);
  assertDateRange(input.startDate, input.endDate);

  const { result } = await solveBrief({
    companyId: input.companyId,
    startDate: input.startDate,
    endDate: input.endDate,
    headcount: input.headcount,
    budgetPerMeal: input.budgetPerMeal,
    pricingListId: input.pricingListId,
    sourceMenuId: input.sourceMenuId,
    slots: input.slots,
    excludeAllergens: input.excludeAllergens ?? [],
    varietyWindowDays: input.varietyWindowDays ?? 2,
    targets: {
      minCaloriesKcal: input.minCaloriesKcal ?? null,
      maxCaloriesKcal: input.maxCaloriesKcal ?? null,
      minProteinG: input.minProteinG ?? null,
      maxProteinG: input.maxProteinG ?? null,
      minCarbsG: input.minCarbsG ?? null,
      maxCarbsG: input.maxCarbsG ?? null,
      maxFatG: input.maxFatG ?? null,
    },
  });

  return result;
}

/**
 * Solves the stored brief and replaces the plan's days in one transaction.
 *
 * @param planId Plan to regenerate.
 * @param keepLockedItems Keep human-locked picks and re-solve around them.
 * @returns The regenerated plan with its days and items.
 */
export async function generatePlan(planId: string, keepLockedItems = true) {
  await loadPlanOrThrow(planId);
  await generatePlanRecord(planId, keepLockedItems);
  return getPlan(planId);
}

/** Shared by both surfaces. Assumes the caller authorised access to the plan. */
async function generatePlanRecord(planId: string, keepLockedItems = true) {
  const plan = await loadPlanRow(planId);
  if (plan.status === 'approved') {
    throw new ConflictError('An approved meal plan cannot be regenerated; duplicate it instead');
  }

  const slots = parseSlots(plan.slot_spec);
  if (slots.length === 0) {
    throw new BadRequestError('The plan has no meal components configured');
  }

  const lockedPicks: LockedPick[] = keepLockedItems
    ? (
        await prisma.mealPlanItem.findMany({
          where: { is_locked: true, day: { meal_plan_id: planId } },
          include: { day: { select: { plan_date: true } } },
        })
      ).map((item) => ({
        date: isoDate(item.day.plan_date),
        componentType: item.component_type as ComponentType,
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
      }))
    : [];

  const { result } = await solveBrief(
    {
      companyId: plan.company_id,
      startDate: isoDate(plan.start_date),
      endDate: isoDate(plan.end_date),
      headcount: plan.headcount,
      budgetPerMeal: plan.budget_per_meal.toString(),
      pricingListId: plan.pricing_list_id,
      sourceMenuId: plan.source_menu_id,
      slots,
      excludeAllergens: plan.exclude_allergens,
      varietyWindowDays: plan.variety_window_days,
      targets: targetsOf(plan),
    },
    lockedPicks,
  );

  const actor = actorColumns();

  await prisma.$transaction(async (tx) => {
    await tx.mealPlanDay.deleteMany({ where: { meal_plan_id: planId } });

    // Bulk insert rather than one round trip per day: a quarter-year plan is
    // 92 days, which would otherwise run 92 sequential writes inside one
    // interactive transaction and hit the transaction timeout.
    const createdDays = await tx.mealPlanDay.createManyAndReturn({
      data: result.days.map((day, index) => ({
        meal_plan_id: planId,
        plan_date: new Date(`${day.date}T00:00:00.000Z`),
        sort_order: index,
        cost_per_head: new Decimal(day.costPerHead),
        total_cost: new Decimal(day.totalCost),
        calories_kcal: new Decimal(day.caloriesKcal),
        protein_g: new Decimal(day.proteinG),
        carbs_g: new Decimal(day.carbsG),
        fat_g: new Decimal(day.fatG),
        is_feasible: day.isFeasible,
        warnings: day.warnings as unknown as Prisma.InputJsonValue,
      })),
      select: { id: true, plan_date: true },
    });

    const dayIdByDate = new Map(
      createdDays.map((day) => [isoDate(day.plan_date), day.id]),
    );

    await tx.mealPlanItem.createMany({
      data: result.days.flatMap((day) => {
        const dayId = dayIdByDate.get(day.date);
        if (!dayId) return [];
        return day.items.map((item, itemIndex) => ({
          meal_plan_day_id: dayId,
          product_id: item.productId,
          variant_id: item.variantId,
          component_type: item.componentType,
          quantity: item.quantity,
          unit_price: new Decimal(item.unitPrice),
          line_total: new Decimal(item.lineTotal),
          calories_kcal: new Decimal(item.caloriesKcal),
          protein_g: new Decimal(item.proteinG),
          carbs_g: new Decimal(item.carbsG),
          fat_g: new Decimal(item.fatG),
          is_locked: item.isLocked,
          sort_order: itemIndex,
        }));
      }),
    });

    await tx.mealPlan.update({
      where: { id: planId },
      data: {
        status: 'generated',
        generated_at: new Date(),
        is_feasible: result.isFeasible,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
        total_cost: new Decimal(result.totalCost),
        avg_cost_per_meal: new Decimal(result.avgCostPerMeal),
        avg_calories_kcal: new Decimal(result.avgCaloriesKcal),
        avg_protein_g: new Decimal(result.avgProteinG),
        avg_carbs_g: new Decimal(result.avgCarbsG),
        avg_fat_g: new Decimal(result.avgFatG),
        updated_by_type: actor.type,
        updated_by_id: actor.id,
      },
    });
  });
}

// ── Manual day edits ──────────────────────────────────────────────────────────

async function loadDayOrThrow(planId: string, dayId: string) {
  const day = await prisma.mealPlanDay.findFirst({
    where: { id: dayId, meal_plan_id: planId },
  });
  if (!day) {
    throw new NotFoundError('Plan day not found');
  }
  return day;
}

async function assertPlanEditable(planId: string) {
  const plan = await loadPlanOrThrow(planId);
  if (plan.status === 'approved') {
    throw new ConflictError('An approved meal plan cannot be edited; duplicate it instead');
  }
  return plan;
}

/**
 * Recomputes a day's cost and macro rollups from its items, then rolls the
 * whole-plan averages back up. Called after every manual day edit so the
 * stored totals never drift from the item rows.
 */
async function recalculateDay(planId: string, dayId: string): Promise<void> {
  const plan = await loadPlanRow(planId);
  const day = await prisma.mealPlanDay.findFirstOrThrow({
    where: { id: dayId, meal_plan_id: planId },
    include: { items: true },
  });

  const totals = day.items.reduce(
    (acc, item) => ({
      cost: acc.cost.plus(item.line_total),
      calories: acc.calories.plus(item.calories_kcal),
      protein: acc.protein.plus(item.protein_g),
      carbs: acc.carbs.plus(item.carbs_g),
      fat: acc.fat.plus(item.fat_g),
    }),
    {
      cost: new Decimal(0),
      calories: new Decimal(0),
      protein: new Decimal(0),
      carbs: new Decimal(0),
      fat: new Decimal(0),
    },
  );

  // Same rule set the solver uses, so a hand-edited day is judged identically.
  const warnings = evaluateDayWarnings(
    isoDate(day.plan_date),
    {
      cost: Number(totals.cost),
      caloriesKcal: Number(totals.calories),
      proteinG: Number(totals.protein),
      carbsG: Number(totals.carbs),
      fatG: Number(totals.fat),
    },
    Number(plan.budget_per_meal),
    targetsOf(plan),
  );

  // Day rollup and plan rollup move together: a crash between the two would
  // leave the plan averages disagreeing with the days they are averaging.
  await prisma.$transaction(async (tx) => {
    await tx.mealPlanDay.update({
      where: { id: dayId },
      data: {
        cost_per_head: totals.cost,
        total_cost: totals.cost.times(plan.headcount),
        calories_kcal: totals.calories,
        protein_g: totals.protein,
        carbs_g: totals.carbs,
        fat_g: totals.fat,
        is_feasible: warnings.length === 0 && day.items.length > 0,
        warnings: warnings as unknown as Prisma.InputJsonValue,
      },
    });

    const days = await tx.mealPlanDay.findMany({ where: { meal_plan_id: planId } });
    const dayCount = Math.max(1, days.length);
    const sum = (pick: (d: (typeof days)[number]) => Decimal) =>
      days.reduce((acc, entry) => acc.plus(pick(entry)), new Decimal(0));

    await tx.mealPlan.update({
      where: { id: planId },
      data: {
        total_cost: sum((d) => d.total_cost),
        avg_cost_per_meal: sum((d) => d.cost_per_head).dividedBy(dayCount).toDecimalPlaces(2),
        avg_calories_kcal: sum((d) => d.calories_kcal).dividedBy(dayCount).toDecimalPlaces(2),
        avg_protein_g: sum((d) => d.protein_g).dividedBy(dayCount).toDecimalPlaces(2),
        avg_carbs_g: sum((d) => d.carbs_g).dividedBy(dayCount).toDecimalPlaces(2),
        avg_fat_g: sum((d) => d.fat_g).dividedBy(dayCount).toDecimalPlaces(2),
        is_feasible: days.every((entry) => entry.is_feasible),
      },
    });
  });
}

async function serializeDayById(dayId: string) {
  const day = await prisma.mealPlanDay.findFirstOrThrow({
    where: { id: dayId },
    include: { items: { include: { product: { select: { name: true } } } } },
  });
  return serializeDay(day);
}

export async function addItem(
  planId: string,
  dayId: string,
  input: {
    productId: string;
    variantId?: string | null;
    componentType?: ComponentType;
    quantity?: number;
    isLocked?: boolean;
  },
) {
  const plan = await assertPlanEditable(planId);
  await loadDayOrThrow(planId, dayId);

  const product = await prisma.product.findFirst({
    where: { id: input.productId, is_deleted: false },
    include: { nutrition: true },
  });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const quantity = input.quantity ?? 1;
  const effectiveListId =
    plan.pricing_list_id ??
    (await menuResolver.resolveEffectivePricingList(plan.company_id)).pricingListId;
  const listPrices = await menuResolver.resolveListPrices(effectiveListId, [product.id]);
  const unitPrice = listPrices.get(product.id) ?? product.base_price;
  if (unitPrice === null) {
    throw new BadRequestError('This product has no price yet and cannot be added to a plan');
  }

  const nutrition = product.nutrition;
  const perUnit = {
    calories: nutrition?.calories_kcal ?? new Decimal(0),
    protein: nutrition?.protein_g ?? new Decimal(0),
    carbs: nutrition?.carbs_g ?? new Decimal(0),
    fat: nutrition?.fat_g ?? new Decimal(0),
  };

  const componentType = input.componentType ?? nutrition?.component_type ?? 'other';

  // Adding a product the day already carries bumps the portion count rather
  // than leaving two lines for the same dish on one menu.
  const existing = await prisma.mealPlanItem.findFirst({
    where: {
      meal_plan_day_id: dayId,
      product_id: product.id,
      variant_id: input.variantId ?? null,
      component_type: componentType,
    },
  });

  if (existing) {
    const merged = existing.quantity + quantity;
    await prisma.mealPlanItem.update({
      where: { id: existing.id },
      data: {
        quantity: merged,
        line_total: unitPrice.times(merged),
        calories_kcal: perUnit.calories.times(merged),
        protein_g: perUnit.protein.times(merged),
        carbs_g: perUnit.carbs.times(merged),
        fat_g: perUnit.fat.times(merged),
        ...(input.isLocked !== undefined ? { is_locked: input.isLocked } : {}),
      },
    });
  } else {
    const lastItem = await prisma.mealPlanItem.findFirst({
      where: { meal_plan_day_id: dayId },
      orderBy: { sort_order: 'desc' },
      select: { sort_order: true },
    });

    await prisma.mealPlanItem.create({
      data: {
        meal_plan_day_id: dayId,
        product_id: product.id,
        variant_id: input.variantId ?? null,
        component_type: componentType,
        quantity,
        unit_price: unitPrice,
        line_total: unitPrice.times(quantity),
        calories_kcal: perUnit.calories.times(quantity),
        protein_g: perUnit.protein.times(quantity),
        carbs_g: perUnit.carbs.times(quantity),
        fat_g: perUnit.fat.times(quantity),
        is_locked: input.isLocked ?? true,
        sort_order: (lastItem?.sort_order ?? -1) + 1,
      },
    });
  }

  await recalculateDay(planId, dayId);
  return serializeDayById(dayId);
}

export async function updateItem(
  planId: string,
  dayId: string,
  itemId: string,
  input: { quantity?: number; isLocked?: boolean },
) {
  await assertPlanEditable(planId);
  await loadDayOrThrow(planId, dayId);

  const item = await prisma.mealPlanItem.findFirst({
    where: { id: itemId, meal_plan_day_id: dayId },
  });
  if (!item) {
    throw new NotFoundError('Plan item not found');
  }

  if (input.quantity !== undefined && input.quantity !== item.quantity) {
    const perUnit = {
      price: item.unit_price,
      calories: item.calories_kcal.dividedBy(item.quantity),
      protein: item.protein_g.dividedBy(item.quantity),
      carbs: item.carbs_g.dividedBy(item.quantity),
      fat: item.fat_g.dividedBy(item.quantity),
    };
    await prisma.mealPlanItem.update({
      where: { id: itemId },
      data: {
        quantity: input.quantity,
        line_total: perUnit.price.times(input.quantity),
        calories_kcal: perUnit.calories.times(input.quantity).toDecimalPlaces(2),
        protein_g: perUnit.protein.times(input.quantity).toDecimalPlaces(2),
        carbs_g: perUnit.carbs.times(input.quantity).toDecimalPlaces(2),
        fat_g: perUnit.fat.times(input.quantity).toDecimalPlaces(2),
        ...(input.isLocked !== undefined ? { is_locked: input.isLocked } : {}),
      },
    });
  } else if (input.isLocked !== undefined) {
    await prisma.mealPlanItem.update({
      where: { id: itemId },
      data: { is_locked: input.isLocked },
    });
  }

  await recalculateDay(planId, dayId);
  return serializeDayById(dayId);
}

export async function removeItem(planId: string, dayId: string, itemId: string) {
  await assertPlanEditable(planId);
  await loadDayOrThrow(planId, dayId);

  const item = await prisma.mealPlanItem.findFirst({
    where: { id: itemId, meal_plan_day_id: dayId },
  });
  if (!item) {
    throw new NotFoundError('Plan item not found');
  }

  await prisma.mealPlanItem.delete({ where: { id: itemId } });
  await recalculateDay(planId, dayId);
}

// ── Company-facing surface (§31) ──────────────────────────────────────────────
//
// The kitchen proposes a plan; the client swaps components inside the budget
// and signs off. Everything here is scoped to the caller's own company and
// never trusts a companyId from the request.

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

/** Only plans the kitchen has released; drafts stay internal. */
const CLIENT_VISIBLE_STATUSES = ['generated', 'approved'];

async function loadCompanyPlanOrThrow(planId: string, companyId: string) {
  const plan = await prisma.mealPlan.findFirst({
    where: {
      id: planId,
      company_id: companyId,
      is_deleted: false,
      status: { in: CLIENT_VISIBLE_STATUSES },
    },
    include: { company: { select: { legal_name: true } } },
  });
  if (!plan) {
    throw new NotFoundError('Meal plan not found');
  }
  return plan;
}

export async function listCompanyPlans() {
  const actor = getCompanyActorOrThrow();
  const rows = await prisma.mealPlan.findMany({
    where: {
      company_id: actor.companyId,
      is_deleted: false,
      status: { in: CLIENT_VISIBLE_STATUSES },
    },
    include: { company: { select: { legal_name: true } } },
    orderBy: [{ start_date: 'desc' }],
  });
  return rows.map(serializePlan);
}

export async function getCompanyPlan(planId: string) {
  const actor = getCompanyActorOrThrow();
  const plan = await loadCompanyPlanOrThrow(planId, actor.companyId);
  const days = await prisma.mealPlanDay.findMany({
    where: { meal_plan_id: planId },
    include: { items: { include: { product: { select: { name: true } } } } },
    orderBy: { plan_date: 'asc' },
  });
  return { ...serializePlan(plan), days: days.map(serializeDay) };
}

/**
 * The swap menu for one item: every other product of the same component, with
 * the day total each choice would produce and whether it stays in budget.
 *
 * @param planId Plan the day belongs to.
 * @param dayId Day being edited.
 * @param itemId Item the client wants to replace.
 * @returns Alternatives ordered cheapest first, affordable ones first.
 */
export async function listSwapOptions(planId: string, dayId: string, itemId: string) {
  const actor = getCompanyActorOrThrow();
  const plan = await loadCompanyPlanOrThrow(planId, actor.companyId);

  const day = await prisma.mealPlanDay.findFirst({
    where: { id: dayId, meal_plan_id: planId },
    include: { items: true },
  });
  if (!day) {
    throw new NotFoundError('Plan day not found');
  }
  const item = day.items.find((row) => row.id === itemId);
  if (!item) {
    throw new NotFoundError('Plan item not found');
  }

  const candidates = await resolveCandidates(
    plan.company_id,
    plan.source_menu_id,
    plan.pricing_list_id,
  );

  const budget = Number(plan.budget_per_meal);
  const targets = targetsOf(plan);
  const others = day.items.filter((row) => row.id !== itemId);
  const base = others.reduce(
    (acc, row) => ({
      cost: acc.cost + Number(row.line_total),
      caloriesKcal: acc.caloriesKcal + Number(row.calories_kcal),
      proteinG: acc.proteinG + Number(row.protein_g),
      carbsG: acc.carbsG + Number(row.carbs_g),
      fatG: acc.fatG + Number(row.fat_g),
    }),
    { cost: 0, caloriesKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const options = candidates
    .filter((candidate) => candidate.componentType === item.component_type)
    .filter((candidate) => !plan.exclude_allergens.some((a) => candidate.allergens.includes(a)))
    .map((candidate) => {
      const totals = {
        cost: base.cost + candidate.unitPrice * item.quantity,
        caloriesKcal: base.caloriesKcal + candidate.caloriesKcal * item.quantity,
        proteinG: base.proteinG + candidate.proteinG * item.quantity,
        carbsG: base.carbsG + candidate.carbsG * item.quantity,
        fatG: base.fatG + candidate.fatG * item.quantity,
      };
      const warnings = evaluateDayWarnings(isoDate(day.plan_date), totals, budget, targets);
      return {
        productId: candidate.productId,
        name: candidate.name,
        componentType: candidate.componentType,
        unitPrice: candidate.unitPrice.toFixed(2),
        currency: plan.currency,
        caloriesKcal: candidate.caloriesKcal.toFixed(2),
        proteinG: candidate.proteinG.toFixed(2),
        carbsG: candidate.carbsG.toFixed(2),
        fatG: candidate.fatG.toFixed(2),
        allergens: candidate.allergens,
        isCurrent: candidate.productId === item.product_id,
        withinBudget: totals.cost <= budget,
        resultingCostPerHead: totals.cost.toFixed(2),
        resultingProteinG: totals.proteinG.toFixed(2),
        resultingCarbsG: totals.carbsG.toFixed(2),
        resultingCaloriesKcal: totals.caloriesKcal.toFixed(2),
        warnings,
      };
    })
    .sort((a, b) => {
      if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;
      return Number(a.unitPrice) - Number(b.unitPrice);
    });

  return options;
}

/**
 * Applies a client's choice to one slot.
 *
 * The budget is the one hard rule: a swap that would take the day over the
 * agreed per-head figure is refused. Nutrition drift is allowed but surfaces
 * as a warning on the day.
 */
export async function swapCompanyPlanItem(
  planId: string,
  dayId: string,
  itemId: string,
  productId: string,
) {
  const actor = getCompanyActorOrThrow();
  const plan = await loadCompanyPlanOrThrow(planId, actor.companyId);
  if (plan.status === 'approved') {
    throw new ConflictError('This plan is already confirmed and cannot be changed');
  }

  const day = await prisma.mealPlanDay.findFirst({
    where: { id: dayId, meal_plan_id: planId },
    include: { items: true },
  });
  if (!day) {
    throw new NotFoundError('Plan day not found');
  }
  const item = day.items.find((row) => row.id === itemId);
  if (!item) {
    throw new NotFoundError('Plan item not found');
  }

  const candidates = await resolveCandidates(
    plan.company_id,
    plan.source_menu_id,
    plan.pricing_list_id,
  );
  const choice = candidates.find((candidate) => candidate.productId === productId);
  if (!choice) {
    throw new BadRequestError('That product is not available for this plan');
  }
  if (choice.componentType !== item.component_type) {
    throw new BadRequestError(
      `That product is a ${choice.componentType}, but this slot is a ${item.component_type}`,
    );
  }
  if (plan.exclude_allergens.some((a) => choice.allergens.includes(a))) {
    throw new BadRequestError('That product contains an allergen excluded from this plan');
  }

  const othersCost = day.items
    .filter((row) => row.id !== itemId)
    .reduce((sum, row) => sum + Number(row.line_total), 0);
  const newCost = othersCost + choice.unitPrice * item.quantity;
  if (newCost > Number(plan.budget_per_meal)) {
    throw new BadRequestError(
      `That choice would cost ${newCost.toFixed(2)} per head, over the agreed ${Number(plan.budget_per_meal).toFixed(2)} budget`,
    );
  }

  const quantity = item.quantity;
  await prisma.mealPlanItem.update({
    where: { id: itemId },
    data: {
      product_id: choice.productId,
      variant_id: choice.variantId ?? null,
      unit_price: new Decimal(choice.unitPrice),
      line_total: new Decimal(choice.unitPrice * quantity),
      calories_kcal: new Decimal(choice.caloriesKcal * quantity),
      protein_g: new Decimal(choice.proteinG * quantity),
      carbs_g: new Decimal(choice.carbsG * quantity),
      fat_g: new Decimal(choice.fatG * quantity),
      // A client pick must survive a regenerate by the kitchen.
      is_locked: true,
    },
  });

  await recalculateDay(planId, dayId);
  return serializeDayById(dayId);
}

/**
 * Client sign-off. Locks the plan and turns each day into a real order.
 *
 * Orders go through the normal ordering service, so pricing, VAT, ordering
 * rules and the order workflow behave exactly as they do for a manual order.
 * Idempotent: a plan that already produced orders is not billed twice.
 *
 * @param planId Plan being confirmed.
 * @param input Fulfilment choice applied to every day of the plan.
 * @returns The confirmed plan plus the orders that were created.
 */
export async function confirmCompanyPlan(
  planId: string,
  input: { fulfillmentType: 'delivery' | 'pickup'; deliveryAddressId?: string; departmentId?: string },
) {
  const actor = getCompanyActorOrThrow();
  const plan = await loadCompanyPlanOrThrow(planId, actor.companyId);

  const alreadyOrdered = await prisma.order.count({
    where: { meal_plan_id: planId, is_deleted: false },
  });
  if (alreadyOrdered > 0) {
    throw new ConflictError('This plan has already been confirmed and ordered');
  }

  const days = await prisma.mealPlanDay.findMany({
    where: { meal_plan_id: planId },
    include: { items: true },
    orderBy: { plan_date: 'asc' },
  });
  if (days.length === 0) {
    throw new BadRequestError('This plan has no days to order');
  }
  if (input.fulfillmentType === 'delivery' && !input.deliveryAddressId) {
    throw new BadRequestError('A delivery address is required for delivery orders');
  }

  const createdOrderIds: string[] = [];
  for (const day of days) {
    if (day.items.length === 0) continue;
    const order = await ordersService.createOrder({
      items: day.items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id ?? undefined,
        // One serving per head, per component.
        quantity: item.quantity * plan.headcount,
      })),
      requestedDeliveryAt: day.plan_date.toISOString(),
      fulfillmentType: input.fulfillmentType as FulfillmentType,
      deliveryAddressId: input.deliveryAddressId,
      departmentId: input.departmentId,
      sourceChannel: 'meal_plan',
    });
    createdOrderIds.push(order.id);
  }

  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: createdOrderIds } },
      data: { meal_plan_id: planId },
    }),
    prisma.mealPlan.update({
      where: { id: planId },
      data: {
        status: 'approved',
        confirmed_at: new Date(),
        confirmed_by: actor.id,
        approved_at: plan.approved_at ?? new Date(),
      },
    }),
  ]);

  return { plan: await getCompanyPlan(planId), orderIds: createdOrderIds };
}

/**
 * The client builds their own brief: their budget, their dates, the components
 * they want. Solved immediately so they see the result rather than waiting for
 * the kitchen.
 *
 * The company is taken from the token, never from the body, and the commercial
 * levers (which pricing list, which menu) stay with the kitchen: the plan uses
 * whatever is already assigned to this company.
 */
export async function createCompanyPlan(
  input: Omit<PlanBriefInput, 'companyId' | 'pricingListId' | 'sourceMenuId'> & {
    name?: string;
    currency?: string;
  },
) {
  const actor = getCompanyActorOrThrow();

  const company = await prisma.company.findFirst({
    where: { id: actor.companyId, is_deleted: false },
    select: { legal_name: true, approval_status: true },
  });
  if (!company) {
    throw new NotFoundError('Company not found');
  }
  if (company.approval_status !== 'approved') {
    throw new BadRequestError('Your company must be approved before requesting a meal plan');
  }

  const created = await createPlanRecord({
    ...input,
    companyId: actor.companyId,
    name: input.name?.trim() || `${company.legal_name} ${input.startDate} to ${input.endDate}`,
    currency: input.currency ?? 'EGP',
    pricingListId: null,
    sourceMenuId: null,
  });

  await generatePlanRecord(created.id, false);
  return getCompanyPlan(created.id);
}

/** A client can drop a plan they requested, as long as it is not confirmed. */
export async function archiveCompanyPlan(planId: string) {
  const actor = getCompanyActorOrThrow();
  const plan = await loadCompanyPlanOrThrow(planId, actor.companyId);
  if (plan.status === 'approved') {
    throw new ConflictError('A confirmed plan cannot be removed');
  }
  await prisma.mealPlan.update({
    where: { id: planId },
    data: { status: 'archived', is_deleted: true, deleted_at: new Date() },
  });
}

/** Solve a client brief without saving it, so they can try budgets first. */
export async function previewCompanyPlan(
  input: Omit<PlanBriefInput, 'companyId' | 'pricingListId' | 'sourceMenuId'>,
) {
  const actor = getCompanyActorOrThrow();
  assertDateRange(input.startDate, input.endDate);

  const { result } = await solveBrief({
    companyId: actor.companyId,
    startDate: input.startDate,
    endDate: input.endDate,
    headcount: input.headcount,
    budgetPerMeal: input.budgetPerMeal,
    pricingListId: null,
    sourceMenuId: null,
    slots: input.slots,
    excludeAllergens: input.excludeAllergens ?? [],
    varietyWindowDays: input.varietyWindowDays ?? 2,
    targets: {
      minCaloriesKcal: input.minCaloriesKcal ?? null,
      maxCaloriesKcal: input.maxCaloriesKcal ?? null,
      minProteinG: input.minProteinG ?? null,
      maxProteinG: input.maxProteinG ?? null,
      minCarbsG: input.minCarbsG ?? null,
      maxCarbsG: input.maxCarbsG ?? null,
      maxFatG: input.maxFatG ?? null,
    },
  });

  return result;
}

/** What the client can build a plan from: the components their menu actually covers. */
export async function listCompanyComponents() {
  const actor = getCompanyActorOrThrow();
  const candidates = await resolveCandidates(actor.companyId, null, null);

  const byComponent = new Map<string, { count: number; cheapest: number }>();
  for (const candidate of candidates) {
    const entry = byComponent.get(candidate.componentType);
    if (!entry) {
      byComponent.set(candidate.componentType, { count: 1, cheapest: candidate.unitPrice });
    } else {
      entry.count += 1;
      entry.cheapest = Math.min(entry.cheapest, candidate.unitPrice);
    }
  }

  return [...byComponent.entries()]
    .map(([componentType, v]) => ({
      componentType,
      productCount: v.count,
      cheapestPrice: v.cheapest.toFixed(2),
    }))
    .sort((a, b) => a.componentType.localeCompare(b.componentType));
}
