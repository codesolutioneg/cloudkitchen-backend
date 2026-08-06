import { describe, it, expect } from 'vitest';
import {
  buildMealPlan,
  enumerateDates,
  type CandidateProduct,
} from '../../src/engines/mealPlanOptimizer';

function candidate(
  overrides: Partial<CandidateProduct> & Pick<CandidateProduct, 'productId' | 'componentType'>,
): CandidateProduct {
  return {
    name: overrides.productId,
    unitPrice: 10,
    caloriesKcal: 300,
    proteinG: 20,
    carbsG: 30,
    fatG: 10,
    allergens: [],
    variantId: null,
    ...overrides,
  };
}

const PROTEINS = [
  candidate({ productId: 'chicken-cheap', componentType: 'protein', unitPrice: 8, proteinG: 22, carbsG: 6, fatG: 9, caloriesKcal: 230 }),
  candidate({ productId: 'chicken-rich', componentType: 'protein', unitPrice: 14, proteinG: 46, carbsG: 8, fatG: 14, caloriesKcal: 400 }),
  candidate({ productId: 'beef-premium', componentType: 'protein', unitPrice: 26, proteinG: 52, carbsG: 4, fatG: 30, caloriesKcal: 560 }),
];

const CARBS = [
  candidate({ productId: 'rice', componentType: 'carb', unitPrice: 4, proteinG: 5, carbsG: 62, fatG: 2, caloriesKcal: 300 }),
  candidate({ productId: 'bulgur', componentType: 'carb', unitPrice: 5, proteinG: 9, carbsG: 40, fatG: 3, caloriesKcal: 250 }),
  candidate({ productId: 'flatbread', componentType: 'carb', unitPrice: 3, proteinG: 6, carbsG: 48, fatG: 4, caloriesKcal: 260 }),
];

const SALADS = [
  candidate({ productId: 'garden-salad', componentType: 'salad', unitPrice: 4, proteinG: 3, carbsG: 10, fatG: 5, caloriesKcal: 110 }),
  candidate({ productId: 'nut-salad', componentType: 'salad', unitPrice: 6, proteinG: 8, carbsG: 12, fatG: 14, caloriesKcal: 200, allergens: ['nuts'] }),
];

const SLOTS = [
  { componentType: 'protein' as const, quantity: 1 },
  { componentType: 'carb' as const, quantity: 1 },
  { componentType: 'salad' as const, quantity: 1 },
];

describe('enumerateDates', () => {
  it('returns an inclusive range', () => {
    expect(enumerateDates('2026-03-02', '2026-03-05')).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
  });

  it('returns nothing when the range is inverted or unparseable', () => {
    expect(enumerateDates('2026-03-05', '2026-03-02')).toEqual([]);
    expect(enumerateDates('not-a-date', '2026-03-02')).toEqual([]);
  });

  it('caps the range length', () => {
    expect(enumerateDates('2026-01-01', '2026-12-31', 10)).toHaveLength(10);
  });
});

describe('buildMealPlan', () => {
  it('fills every slot and stays inside the budget', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 100,
      budgetPerMeal: 25,
      slots: SLOTS,
      targets: {},
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    });

    const day = plan.days[0]!;
    expect(day.items).toHaveLength(3);
    expect(day.items.map((i) => i.componentType).sort()).toEqual(['carb', 'protein', 'salad']);
    expect(day.costPerHead).toBeLessThanOrEqual(25);
    expect(day.totalCost).toBe(day.costPerHead * 100);
    expect(plan.isFeasible).toBe(true);
  });

  it('trades up to a pricier protein to clear the protein floor', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 1,
      budgetPerMeal: 25,
      slots: SLOTS,
      targets: { minProteinG: 50 },
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    });

    const day = plan.days[0]!;
    expect(day.proteinG).toBeGreaterThanOrEqual(50);
    expect(day.costPerHead).toBeLessThanOrEqual(25);
    expect(day.items.find((i) => i.componentType === 'protein')!.productId).toBe('chicken-rich');
    expect(day.isFeasible).toBe(true);
  });

  it('respects a carb ceiling', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 1,
      budgetPerMeal: 30,
      slots: SLOTS,
      targets: { maxCarbsG: 60 },
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    });

    expect(plan.days[0]!.carbsG).toBeLessThanOrEqual(60);
    expect(plan.days[0]!.isFeasible).toBe(true);
  });

  it('keeps the budget when budget and protein floor conflict, and warns', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 1,
      budgetPerMeal: 16,
      slots: SLOTS,
      targets: { minProteinG: 90 },
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    });

    const day = plan.days[0]!;
    expect(day.costPerHead).toBeLessThanOrEqual(16);
    expect(day.warnings.map((w) => w.code)).toContain('protein_below_target');
    expect(plan.isFeasible).toBe(false);
  });

  it('warns instead of silently overspending when nothing fits the budget', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 1,
      budgetPerMeal: 5,
      slots: SLOTS,
      targets: {},
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    });

    expect(plan.days[0]!.warnings.map((w) => w.code)).toContain('budget_exceeded');
    expect(plan.isFeasible).toBe(false);
  });

  it('drops products carrying an excluded allergen', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 1,
      budgetPerMeal: 40,
      slots: [{ componentType: 'salad', quantity: 1 }],
      targets: { minProteinG: 8 },
      excludeAllergens: ['NUTS'],
      candidates: SALADS,
    });

    expect(plan.days[0]!.items.map((i) => i.productId)).toEqual(['garden-salad']);
  });

  it('honours the variety window across days', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02', '2026-03-03', '2026-03-04'],
      headcount: 1,
      budgetPerMeal: 40,
      slots: [{ componentType: 'protein', quantity: 1 }],
      targets: {},
      varietyWindowDays: 1,
      candidates: PROTEINS,
    });

    const picks = plan.days.map((d) => d.items[0]!.productId);
    expect(picks[0]).not.toBe(picks[1]);
    expect(picks[1]).not.toBe(picks[2]);
  });

  it('relaxes the variety window rather than leaving a slot empty', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02', '2026-03-03'],
      headcount: 1,
      budgetPerMeal: 40,
      slots: [{ componentType: 'protein', quantity: 1 }],
      targets: {},
      varietyWindowDays: 5,
      candidates: [PROTEINS[0]!],
    });

    expect(plan.days[1]!.items).toHaveLength(1);
    expect(plan.days[1]!.warnings.map((w) => w.code)).toContain('variety_window_relaxed');
  });

  it('keeps locked picks and solves around them', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 1,
      budgetPerMeal: 40,
      slots: SLOTS,
      targets: { minProteinG: 40 },
      lockedPicks: [
        { date: '2026-03-02', componentType: 'protein', productId: 'beef-premium', quantity: 1 },
      ],
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    });

    const protein = plan.days[0]!.items.find((i) => i.componentType === 'protein')!;
    expect(protein.productId).toBe('beef-premium');
    expect(protein.isLocked).toBe(true);
  });

  it('reports components that have no candidate at all', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02'],
      headcount: 1,
      budgetPerMeal: 40,
      slots: [...SLOTS, { componentType: 'soup', quantity: 1 }],
      targets: {},
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    });

    expect(plan.warnings.map((w) => w.code)).toContain('no_candidates_for_component');
    expect(plan.isFeasible).toBe(false);
  });

  it('is deterministic for the same brief', () => {
    const request = {
      dates: ['2026-03-02', '2026-03-03'],
      headcount: 50,
      budgetPerMeal: 24,
      slots: SLOTS,
      targets: { minProteinG: 45, maxCarbsG: 80 },
      candidates: [...PROTEINS, ...CARBS, ...SALADS],
    };

    expect(buildMealPlan(request)).toEqual(buildMealPlan(request));
  });

  it('averages cost and macros across the plan', () => {
    const plan = buildMealPlan({
      dates: ['2026-03-02', '2026-03-03'],
      headcount: 10,
      budgetPerMeal: 30,
      slots: [{ componentType: 'carb', quantity: 2 }],
      targets: {},
      varietyWindowDays: 0,
      candidates: CARBS,
    });

    const expectedAvg =
      (plan.days[0]!.costPerHead + plan.days[1]!.costPerHead) / 2;
    expect(plan.avgCostPerMeal).toBeCloseTo(expectedAvg, 2);
    expect(plan.totalCost).toBeCloseTo(
      (plan.days[0]!.costPerHead + plan.days[1]!.costPerHead) * 10,
      2,
    );
  });
});
