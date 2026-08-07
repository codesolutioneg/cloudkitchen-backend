/**
 * Budget meal planner (§31).
 *
 * Picks one product per component slot, per day, so that a factory canteen
 * meal stays inside a per-head budget while hitting a nutrition brief
 * (protein floor, carb ceiling, calorie band, fat ceiling).
 *
 * Pure functions only: no Prisma, no I/O, no clock, no randomness. The service
 * layer resolves candidates and effective prices and hands them in, which keeps
 * the search deterministic and unit-testable.
 *
 * Search: cheapest feasible start, then steepest-descent hill climbing on a
 * single penalty function. One slot swap per step, candidates walked in a
 * stable order, first strict improvement wins ties. Bounded iterations.
 */

export const COMPONENT_TYPES = [
  'protein',
  'carb',
  'vegetable',
  'salad',
  'soup',
  'side',
  'drink',
  'dessert',
  'other',
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

export interface CandidateProduct {
  productId: string;
  variantId?: string | null;
  name: string;
  componentType: ComponentType;
  /** Effective per-serving price for the buying company, in currency units. */
  unitPrice: number;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  allergens: string[];
  /** vegetarian, halal, gluten_free and so on. */
  dietTags: string[];
}

export interface SlotSpec {
  componentType: ComponentType;
  quantity: number;
}

export interface NutritionTargets {
  minCaloriesKcal?: number | null;
  maxCaloriesKcal?: number | null;
  minProteinG?: number | null;
  maxProteinG?: number | null;
  minCarbsG?: number | null;
  maxCarbsG?: number | null;
  maxFatG?: number | null;
}

/** A human-locked pick that the optimizer must keep. */
export interface LockedPick {
  /** ISO date (YYYY-MM-DD) of the day this pick belongs to. */
  date: string;
  componentType: ComponentType;
  productId: string;
  variantId?: string | null;
  quantity: number;
}

export interface PlanRequest {
  /** ISO dates (YYYY-MM-DD), one meal per date. */
  dates: string[];
  headcount: number;
  /** Money ceiling for one head, one day. */
  budgetPerMeal: number;
  slots: SlotSpec[];
  targets: NutritionTargets;
  excludeAllergens?: string[];
  /** Every picked product must carry all of these. */
  requireDietTags?: string[];
  /** A product picked today cannot come back for this many following days. */
  varietyWindowDays?: number;
  lockedPicks?: LockedPick[];
  candidates: CandidateProduct[];
}

export interface PlannedItem {
  productId: string;
  variantId: string | null;
  name: string;
  componentType: ComponentType;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isLocked: boolean;
}

export interface PlanWarning {
  code:
    | 'no_candidates_for_component'
    | 'diet_requirement_unmet'
    | 'budget_exceeded'
    | 'protein_below_target'
    | 'protein_above_target'
    | 'carbs_above_target'
    | 'carbs_below_target'
    | 'calories_below_target'
    | 'calories_above_target'
    | 'fat_above_target'
    | 'variety_window_relaxed';
  message: string;
  date?: string;
  componentType?: ComponentType;
}

export interface PlannedDay {
  date: string;
  items: PlannedItem[];
  costPerHead: number;
  totalCost: number;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isFeasible: boolean;
  warnings: PlanWarning[];
}

export interface PlanResult {
  days: PlannedDay[];
  isFeasible: boolean;
  totalCost: number;
  avgCostPerMeal: number;
  avgCaloriesKcal: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  warnings: PlanWarning[];
}

const MAX_HILL_CLIMB_STEPS = 200;

/** Money is compared and summed in integer minor units to avoid float drift. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** One concrete pick for one slot. */
interface Slot {
  componentType: ComponentType;
  quantity: number;
  choice: CandidateProduct | null;
  isLocked: boolean;
}

interface Totals {
  costCents: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function slotTotals(slots: Slot[]): Totals {
  const totals: Totals = { costCents: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const slot of slots) {
    if (!slot.choice) continue;
    totals.costCents += toCents(slot.choice.unitPrice) * slot.quantity;
    totals.calories += slot.choice.caloriesKcal * slot.quantity;
    totals.protein += slot.choice.proteinG * slot.quantity;
    totals.carbs += slot.choice.carbsG * slot.quantity;
    totals.fat += slot.choice.fatG * slot.quantity;
  }
  return totals;
}

/**
 * Normalised constraint violation. Zero means every constraint holds.
 *
 * Budget is weighted hardest: a client who signed off on 22 SAR a head will
 * accept a slightly thin protein day, never a silently over-budget one.
 */
function penalty(
  totals: Totals,
  budgetPerMealCents: number,
  targets: NutritionTargets,
): number {
  let score = 0;

  if (totals.costCents > budgetPerMealCents) {
    const over = totals.costCents - budgetPerMealCents;
    score += 10 * (over / Math.max(budgetPerMealCents, 1));
  }

  const band = (
    value: number,
    min: number | null | undefined,
    max: number | null | undefined,
    weight: number,
  ) => {
    if (isFiniteNumber(min) && min > 0 && value < min) {
      score += weight * ((min - value) / min);
    }
    if (isFiniteNumber(max) && max > 0 && value > max) {
      score += weight * ((value - max) / max);
    }
  };

  band(totals.protein, targets.minProteinG, targets.maxProteinG, 4);
  band(totals.carbs, targets.minCarbsG, targets.maxCarbsG, 3);
  band(totals.calories, targets.minCaloriesKcal, targets.maxCaloriesKcal, 2);
  band(totals.fat, null, targets.maxFatG, 2);

  return score;
}

/** Stable ordering so the same brief always yields the same plan. */
function sortCandidates(candidates: CandidateProduct[]): CandidateProduct[] {
  return [...candidates].sort((a, b) => {
    if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
    if (a.proteinG !== b.proteinG) return b.proteinG - a.proteinG;
    return a.productId.localeCompare(b.productId);
  });
}

function candidateKey(candidate: { productId: string; variantId?: string | null }): string {
  return `${candidate.productId}:${candidate.variantId ?? ''}`;
}

function hasExcludedAllergen(candidate: CandidateProduct, excluded: Set<string>): boolean {
  if (excluded.size === 0) return false;
  return candidate.allergens.some((allergen) => excluded.has(allergen.trim().toLowerCase()));
}

/** A halal or vegetarian brief is a hard filter, not a preference to trade off. */
function meetsDietRequirement(candidate: CandidateProduct, required: string[]): boolean {
  if (required.length === 0) return true;
  const tags = new Set((candidate.dietTags ?? []).map((tag) => tag.trim().toLowerCase()));
  return required.every((tag) => tags.has(tag));
}

export interface DayTotals {
  cost: number;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * The single definition of "is this day within the brief".
 *
 * Both the solver and the manual-edit path run this, so a day edited by hand
 * is judged by exactly the same rules as a generated one.
 *
 * @param date ISO date the warnings belong to.
 * @param totals Day totals in currency units and grams.
 * @param budgetPerMeal Per-head money ceiling.
 * @param targets The nutrition brief.
 * @returns One warning per breached constraint; empty when the day is on target.
 */
export function evaluateDayWarnings(
  date: string,
  totals: DayTotals,
  budgetPerMeal: number,
  targets: NutritionTargets,
): PlanWarning[] {
  return buildDayWarnings(
    date,
    {
      costCents: toCents(totals.cost),
      calories: totals.caloriesKcal,
      protein: totals.proteinG,
      carbs: totals.carbsG,
      fat: totals.fatG,
    },
    toCents(budgetPerMeal),
    targets,
  );
}

function buildDayWarnings(
  date: string,
  totals: Totals,
  budgetPerMealCents: number,
  targets: NutritionTargets,
): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (totals.costCents > budgetPerMealCents) {
    warnings.push({
      code: 'budget_exceeded',
      date,
      message: `Day cost ${fromCents(totals.costCents).toFixed(2)} is over the ${fromCents(budgetPerMealCents).toFixed(2)} per-head budget.`,
    });
  }
  if (isFiniteNumber(targets.minProteinG) && totals.protein < targets.minProteinG) {
    warnings.push({
      code: 'protein_below_target',
      date,
      message: `Protein ${round2(totals.protein)} g is below the ${targets.minProteinG} g floor.`,
    });
  }
  if (isFiniteNumber(targets.maxProteinG) && totals.protein > targets.maxProteinG) {
    warnings.push({
      code: 'protein_above_target',
      date,
      message: `Protein ${round2(totals.protein)} g is above the ${targets.maxProteinG} g ceiling.`,
    });
  }
  if (isFiniteNumber(targets.maxCarbsG) && totals.carbs > targets.maxCarbsG) {
    warnings.push({
      code: 'carbs_above_target',
      date,
      message: `Carbs ${round2(totals.carbs)} g exceed the ${targets.maxCarbsG} g ceiling.`,
    });
  }
  if (isFiniteNumber(targets.minCarbsG) && totals.carbs < targets.minCarbsG) {
    warnings.push({
      code: 'carbs_below_target',
      date,
      message: `Carbs ${round2(totals.carbs)} g are below the ${targets.minCarbsG} g floor.`,
    });
  }
  if (isFiniteNumber(targets.minCaloriesKcal) && totals.calories < targets.minCaloriesKcal) {
    warnings.push({
      code: 'calories_below_target',
      date,
      message: `Energy ${round2(totals.calories)} kcal is below the ${targets.minCaloriesKcal} kcal floor.`,
    });
  }
  if (isFiniteNumber(targets.maxCaloriesKcal) && totals.calories > targets.maxCaloriesKcal) {
    warnings.push({
      code: 'calories_above_target',
      date,
      message: `Energy ${round2(totals.calories)} kcal is above the ${targets.maxCaloriesKcal} kcal ceiling.`,
    });
  }
  if (isFiniteNumber(targets.maxFatG) && totals.fat > targets.maxFatG) {
    warnings.push({
      code: 'fat_above_target',
      date,
      message: `Fat ${round2(totals.fat)} g exceeds the ${targets.maxFatG} g ceiling.`,
    });
  }

  return warnings;
}

/**
 * Steepest-descent over single-slot swaps. Locked slots never move.
 */
function optimiseDay(
  slots: Slot[],
  poolByComponent: Map<ComponentType, CandidateProduct[]>,
  budgetPerMealCents: number,
  targets: NutritionTargets,
): void {
  let current = penalty(slotTotals(slots), budgetPerMealCents, targets);

  for (let step = 0; step < MAX_HILL_CLIMB_STEPS && current > 0; step += 1) {
    let bestScore = current;
    let bestSlotIndex = -1;
    let bestChoice: CandidateProduct | null = null;

    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!;
      if (slot.isLocked) continue;
      const pool = poolByComponent.get(slot.componentType) ?? [];
      const original = slot.choice;

      for (const candidate of pool) {
        if (original && candidateKey(candidate) === candidateKey(original)) continue;
        slot.choice = candidate;
        const score = penalty(slotTotals(slots), budgetPerMealCents, targets);
        if (score < bestScore - 1e-9) {
          bestScore = score;
          bestSlotIndex = i;
          bestChoice = candidate;
        }
      }

      slot.choice = original;
    }

    if (bestSlotIndex < 0 || !bestChoice) break;
    slots[bestSlotIndex]!.choice = bestChoice;
    current = bestScore;
  }
}

/**
 * Builds a day-by-day meal plan for a nutrition + budget brief.
 *
 * @param request Candidates, slot shape, budget and nutrition targets.
 * @returns Planned days with costs, nutrition rollups and per-day warnings.
 */
export function buildMealPlan(request: PlanRequest): PlanResult {
  const headcount = Math.max(1, Math.trunc(request.headcount));
  const budgetPerMealCents = toCents(request.budgetPerMeal);
  const varietyWindow = Math.max(0, Math.trunc(request.varietyWindowDays ?? 0));
  const excluded = new Set(
    (request.excludeAllergens ?? []).map((allergen) => allergen.trim().toLowerCase()),
  );

  const requiredDiet = (request.requireDietTags ?? []).map((tag) => tag.trim().toLowerCase());
  const usable = sortCandidates(
    request.candidates.filter(
      (candidate) =>
        !hasExcludedAllergen(candidate, excluded) && meetsDietRequirement(candidate, requiredDiet),
    ),
  );

  const byComponent = new Map<ComponentType, CandidateProduct[]>();
  for (const candidate of usable) {
    const bucket = byComponent.get(candidate.componentType);
    if (bucket) bucket.push(candidate);
    else byComponent.set(candidate.componentType, [candidate]);
  }

  const planWarnings: PlanWarning[] = [];
  for (const slot of request.slots) {
    if ((byComponent.get(slot.componentType) ?? []).length === 0) {
      // Say which constraint emptied the pool, so the fix is obvious.
      const beforeDiet = request.candidates.filter(
        (c) => c.componentType === slot.componentType && !hasExcludedAllergen(c, excluded),
      ).length;
      planWarnings.push(
        requiredDiet.length > 0 && beforeDiet > 0
          ? {
              code: 'diet_requirement_unmet',
              componentType: slot.componentType,
              message: `No "${slot.componentType}" product carries every required tag (${requiredDiet.join(', ')}).`,
            }
          : {
              code: 'no_candidates_for_component',
              componentType: slot.componentType,
              message: `No priced product with nutrition data is available for the "${slot.componentType}" component.`,
            },
      );
    }
  }

  const lockedByDate = new Map<string, LockedPick[]>();
  for (const pick of request.lockedPicks ?? []) {
    const bucket = lockedByDate.get(pick.date);
    if (bucket) bucket.push(pick);
    else lockedByDate.set(pick.date, [pick]);
  }

  /** productKey -> index of the last day that used it, for the variety window. */
  const lastUsedDayIndex = new Map<string, number>();
  const days: PlannedDay[] = [];

  request.dates.forEach((date, dayIndex) => {
    const locked = [...(lockedByDate.get(date) ?? [])];
    const dayWarnings: PlanWarning[] = [];

    // Products used inside the variety window are held back, unless holding
    // them back would leave a component with nothing to pick.
    const poolForDay = new Map<ComponentType, CandidateProduct[]>();
    for (const [componentType, pool] of byComponent) {
      const fresh = pool.filter((candidate) => {
        const usedAt = lastUsedDayIndex.get(candidateKey(candidate));
        return usedAt === undefined || dayIndex - usedAt > varietyWindow;
      });
      if (fresh.length > 0) {
        poolForDay.set(componentType, fresh);
      } else if (pool.length > 0) {
        poolForDay.set(componentType, pool);
        dayWarnings.push({
          code: 'variety_window_relaxed',
          date,
          componentType,
          message: `Not enough "${componentType}" options to honour the ${varietyWindow}-day variety window; repeats allowed for this day.`,
        });
      }
    }

    const slots: Slot[] = [];
    for (const spec of request.slots) {
      const quantity = Math.max(1, Math.trunc(spec.quantity));
      for (let n = 0; n < quantity; n += 1) {
        const lockedIndex = locked.findIndex((pick) => pick.componentType === spec.componentType);
        if (lockedIndex >= 0) {
          const pick = locked.splice(lockedIndex, 1)[0]!;
          const match = usable.find((candidate) => candidateKey(candidate) === candidateKey(pick));
          if (match) {
            slots.push({
              componentType: spec.componentType,
              quantity: Math.max(1, Math.trunc(pick.quantity)),
              choice: match,
              isLocked: true,
            });
            continue;
          }
        }
        const pool = poolForDay.get(spec.componentType) ?? [];
        slots.push({
          componentType: spec.componentType,
          quantity: 1,
          // Cheapest start maximises the budget headroom the climb can spend.
          choice: pool[0] ?? null,
          isLocked: false,
        });
      }
    }

    optimiseDay(slots, poolForDay, budgetPerMealCents, request.targets);

    const totals = slotTotals(slots);
    dayWarnings.push(...buildDayWarnings(date, totals, budgetPerMealCents, request.targets));

    const items: PlannedItem[] = slots
      .filter((slot): slot is Slot & { choice: CandidateProduct } => slot.choice !== null)
      .map((slot) => ({
        productId: slot.choice.productId,
        variantId: slot.choice.variantId ?? null,
        name: slot.choice.name,
        componentType: slot.componentType,
        quantity: slot.quantity,
        unitPrice: round2(slot.choice.unitPrice),
        lineTotal: fromCents(toCents(slot.choice.unitPrice) * slot.quantity),
        caloriesKcal: round2(slot.choice.caloriesKcal * slot.quantity),
        proteinG: round2(slot.choice.proteinG * slot.quantity),
        carbsG: round2(slot.choice.carbsG * slot.quantity),
        fatG: round2(slot.choice.fatG * slot.quantity),
        isLocked: slot.isLocked,
      }));

    for (const slot of slots) {
      if (slot.choice) lastUsedDayIndex.set(candidateKey(slot.choice), dayIndex);
    }

    const missingSlots = slots.filter((slot) => slot.choice === null).length;

    days.push({
      date,
      items,
      costPerHead: fromCents(totals.costCents),
      totalCost: fromCents(totals.costCents * headcount),
      caloriesKcal: round2(totals.calories),
      proteinG: round2(totals.protein),
      carbsG: round2(totals.carbs),
      fatG: round2(totals.fat),
      isFeasible: dayWarnings.length === 0 && missingSlots === 0,
      warnings: dayWarnings,
    });
  });

  const dayCount = Math.max(1, days.length);
  const totalCostCents = days.reduce((sum, day) => sum + toCents(day.totalCost), 0);
  const avgCostPerMealCents = Math.round(
    days.reduce((sum, day) => sum + toCents(day.costPerHead), 0) / dayCount,
  );

  return {
    days,
    isFeasible: planWarnings.length === 0 && days.every((day) => day.isFeasible),
    totalCost: fromCents(totalCostCents),
    avgCostPerMeal: fromCents(avgCostPerMealCents),
    avgCaloriesKcal: round2(days.reduce((s, d) => s + d.caloriesKcal, 0) / dayCount),
    avgProteinG: round2(days.reduce((s, d) => s + d.proteinG, 0) / dayCount),
    avgCarbsG: round2(days.reduce((s, d) => s + d.carbsG, 0) / dayCount),
    avgFatG: round2(days.reduce((s, d) => s + d.fatG, 0) / dayCount),
    warnings: planWarnings,
  };
}

/** Inclusive list of ISO dates between two ISO dates, capped for safety. */
export function enumerateDates(startDate: string, endDate: string, maxDays = 92): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < maxDays) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
