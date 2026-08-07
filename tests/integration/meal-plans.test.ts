import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser, registerCompany } from '../helpers/auth';

const SUFFIX = `mp-${Date.now()}`;

interface SeededProduct {
  id: string;
  name: string;
}

describe('Budget meal planning', () => {
  let token = '';
  let companyId = '';
  let categoryId = '';
  const products: Record<string, SeededProduct> = {};

  async function createProduct(
    name: string,
    basePrice: string,
    nutrition: {
      componentType: string;
      caloriesKcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      allergens?: string[];
    },
  ): Promise<SeededProduct> {
    const created = await request(app)
      .post('/api/v1/dashboard/catalog/products')
      .set(bearer(token))
      .send({ categoryId, name, basePrice, currency: 'SAR', visibility: 'public' });
    expect(created.status).toBe(201);

    const saved = await request(app)
      .put(`/api/v1/dashboard/catalog/products/${created.body.data.id}/nutrition`)
      .set(bearer(token))
      .send({ ...nutrition, allergens: nutrition.allergens ?? [] });
    expect(saved.status).toBe(200);

    return { id: created.body.data.id as string, name };
  }

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    token = dash.body.data.accessToken as string;

    const registration = await registerCompany(SUFFIX);
    companyId = registration.body.data.companyId as string;

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(token))
      .send({ name: `Canteen ${SUFFIX}`, slug: `canteen-${SUFFIX}` });
    categoryId = category.body.data.id as string;

    products.cheapChicken = await createProduct(`Chicken budget ${SUFFIX}`, '8.00', {
      componentType: 'protein',
      caloriesKcal: 230,
      proteinG: 22,
      carbsG: 6,
      fatG: 9,
    });
    products.richChicken = await createProduct(`Chicken high protein ${SUFFIX}`, '14.00', {
      componentType: 'protein',
      caloriesKcal: 400,
      proteinG: 46,
      carbsG: 8,
      fatG: 14,
    });
    products.rice = await createProduct(`Garlic rice ${SUFFIX}`, '4.00', {
      componentType: 'carb',
      caloriesKcal: 300,
      proteinG: 5,
      carbsG: 62,
      fatG: 2,
    });
    products.nutSalad = await createProduct(`Nut salad ${SUFFIX}`, '5.00', {
      componentType: 'salad',
      caloriesKcal: 200,
      proteinG: 8,
      carbsG: 12,
      fatG: 14,
      allergens: ['nuts'],
    });
    products.gardenSalad = await createProduct(`Garden salad ${SUFFIX}`, '4.00', {
      componentType: 'salad',
      caloriesKcal: 110,
      proteinG: 3,
      carbsG: 10,
      fatG: 5,
    });
  });

  async function createPlan(overrides: Record<string, unknown> = {}) {
    return request(app)
      .post('/api/v1/dashboard/meal-plans')
      .set(bearer(token))
      .send({
        companyId,
        name: `Plant canteen ${SUFFIX}`,
        startDate: '2026-04-06',
        endDate: '2026-04-08',
        headcount: 200,
        budgetPerMeal: '25.00',
        currency: 'SAR',
        slots: [
          { componentType: 'protein', quantity: 1 },
          { componentType: 'carb', quantity: 1 },
          { componentType: 'salad', quantity: 1 },
        ],
        minProteinG: 45,
        maxCarbsG: 90,
        varietyWindowDays: 0,
        ...overrides,
      });
  }

  it('stores product nutrition and folds allergens to lower case', async () => {
    const upserted = await request(app)
      .put(`/api/v1/dashboard/catalog/products/${products.nutSalad!.id}/nutrition`)
      .set(bearer(token))
      .send({
        componentType: 'salad',
        caloriesKcal: 200,
        proteinG: 8,
        carbsG: 12,
        fatG: 14,
        allergens: ['NUTS', ' Sesame '],
      });

    expect(upserted.status).toBe(200);
    expect(upserted.body.data.allergens).toEqual(['nuts', 'sesame']);

    const fetched = await request(app)
      .get(`/api/v1/dashboard/catalog/products/${products.nutSalad!.id}/nutrition`)
      .set(bearer(token));
    expect(fetched.body.data.componentType).toBe('salad');

    // Restore the single-allergen fixture the planning tests rely on.
    await request(app)
      .put(`/api/v1/dashboard/catalog/products/${products.nutSalad!.id}/nutrition`)
      .set(bearer(token))
      .send({
        componentType: 'salad',
        caloriesKcal: 200,
        proteinG: 8,
        carbsG: 12,
        fatG: 14,
        allergens: ['nuts'],
      });
  });

  it('lists planner candidates with the effective price', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/meal-plans/candidates')
      .set(bearer(token))
      .query({ companyId, componentType: 'protein' });

    expect(res.status).toBe(200);
    const rich = res.body.data.find(
      (c: { productId: string }) => c.productId === products.richChicken!.id,
    );
    expect(rich).toBeTruthy();
    expect(rich.unitPrice).toBe('14.00');
    expect(rich.proteinPerCurrencyUnit).toBe('3.29');
  });

  it('previews a brief without persisting it', async () => {
    const before = await request(app)
      .get('/api/v1/dashboard/meal-plans')
      .set(bearer(token))
      .query({ companyId });

    const preview = await request(app)
      .post('/api/v1/dashboard/meal-plans/preview')
      .set(bearer(token))
      .send({
        companyId,
        startDate: '2026-04-06',
        endDate: '2026-04-07',
        headcount: 100,
        budgetPerMeal: '25.00',
        slots: [
          { componentType: 'protein', quantity: 1 },
          { componentType: 'carb', quantity: 1 },
        ],
        minProteinG: 45,
        varietyWindowDays: 0,
      });

    expect(preview.status).toBe(200);
    expect(preview.body.data.days).toHaveLength(2);
    expect(preview.body.data.days[0].proteinG).toBeGreaterThanOrEqual(45);

    const after = await request(app)
      .get('/api/v1/dashboard/meal-plans')
      .set(bearer(token))
      .query({ companyId });
    expect(after.body.meta.pagination.totalItems).toBe(
      before.body.meta.pagination.totalItems,
    );
  });

  it('generates a plan that meets the brief and rolls up totals', async () => {
    const created = await createPlan();
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('draft');
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});

    expect(generated.status).toBe(200);
    const plan = generated.body.data;
    expect(plan.status).toBe('generated');
    expect(plan.days).toHaveLength(3);
    expect(plan.isFeasible).toBe(true);

    for (const day of plan.days) {
      expect(day.items).toHaveLength(3);
      expect(Number(day.costPerHead)).toBeLessThanOrEqual(25);
      expect(Number(day.proteinG)).toBeGreaterThanOrEqual(45);
      expect(Number(day.carbsG)).toBeLessThanOrEqual(90);
      expect(Number(day.totalCost)).toBeCloseTo(Number(day.costPerHead) * 200, 2);
    }

    const summedTotal = plan.days.reduce(
      (sum: number, day: { totalCost: string }) => sum + Number(day.totalCost),
      0,
    );
    expect(Number(plan.totalCost)).toBeCloseTo(summedTotal, 2);
  });

  it('excludes allergens from the generated plan', async () => {
    const created = await createPlan({ excludeAllergens: ['nuts'] });
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});

    const days = generated.body.data.days as Array<{
      items: Array<{ productId: string; componentType: string }>;
    }>;
    const pickedIds = days.flatMap((day) => day.items.map((item) => item.productId));

    expect(pickedIds).not.toContain(products.nutSalad!.id);
    // The salad slot is still filled: a nut-free option was substituted.
    for (const day of days) {
      expect(day.items.some((item) => item.componentType === 'salad')).toBe(true);
    }
  });

  it('flags an unreachable brief instead of overspending', async () => {
    const created = await createPlan({ budgetPerMeal: '12.00', minProteinG: 90 });
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});

    const plan = generated.body.data;
    expect(plan.isFeasible).toBe(false);
    const codes = plan.days.flatMap((day: { warnings: Array<{ code: string }> }) =>
      day.warnings.map((w) => w.code),
    );
    expect(codes).toContain('protein_below_target');
    expect(codes).toContain('budget_exceeded');
    for (const day of plan.days) {
      // The cheapest possible meal is 8 + 4 + 4. The planner settles there and
      // reports the gap rather than chasing protein into a bigger overspend.
      expect(Number(day.costPerHead)).toBeLessThanOrEqual(16);
    }
  });

  it('keeps locked items across a regenerate', async () => {
    const created = await createPlan();
    const planId = created.body.data.id as string;

    const first = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});
    const dayId = first.body.data.days[0].id as string;
    const proteinItem = first.body.data.days[0].items.find(
      (item: { componentType: string }) => item.componentType === 'protein',
    );

    const locked = await request(app)
      .patch(`/api/v1/dashboard/meal-plans/${planId}/days/${dayId}/items/${proteinItem.id}`)
      .set(bearer(token))
      .send({ isLocked: true });
    expect(locked.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({ keepLockedItems: true });

    const regeneratedDay = second.body.data.days.find(
      (day: { planDate: string }) => day.planDate === first.body.data.days[0].planDate,
    );
    const regeneratedProtein = regeneratedDay.items.find(
      (item: { componentType: string }) => item.componentType === 'protein',
    );
    expect(regeneratedProtein.productId).toBe(proteinItem.productId);
    expect(regeneratedProtein.isLocked).toBe(true);
  });

  it('recomputes day totals after a manual item edit', async () => {
    const created = await createPlan();
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});
    const day = generated.body.data.days[0];

    const added = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/days/${day.id}/items`)
      .set(bearer(token))
      .send({ productId: products.nutSalad!.id, quantity: 2 });

    expect(added.status).toBe(201);
    expect(added.body.data.items).toHaveLength(day.items.length + 1);
    expect(Number(added.body.data.costPerHead)).toBeCloseTo(Number(day.costPerHead) + 10, 2);
    expect(Number(added.body.data.carbsG)).toBeCloseTo(Number(day.carbsG) + 24, 2);

    const addedItem = added.body.data.items.find(
      (item: { productId: string }) => item.productId === products.nutSalad!.id,
    );

    const removed = await request(app)
      .delete(`/api/v1/dashboard/meal-plans/${planId}/days/${day.id}/items/${addedItem.id}`)
      .set(bearer(token));
    expect(removed.status).toBe(204);

    const after = await request(app)
      .get(`/api/v1/dashboard/meal-plans/${planId}`)
      .set(bearer(token));
    const afterDay = after.body.data.days.find((d: { id: string }) => d.id === day.id);
    expect(Number(afterDay.costPerHead)).toBeCloseTo(Number(day.costPerHead), 2);
  });

  it('judges a hand-edited day by the same rules as a generated one', async () => {
    const created = await createPlan({ maxProteinG: 60, minProteinG: 45 });
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});
    const day = generated.body.data.days[0];
    expect(day.isFeasible).toBe(true);

    // The protein ceiling is only enforced by the solver's rule set; a manual
    // add has to be measured against it too.
    const added = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/days/${day.id}/items`)
      .set(bearer(token))
      .send({ productId: products.richChicken!.id, componentType: 'side', quantity: 1 });

    expect(added.status).toBe(201);
    expect(Number(added.body.data.proteinG)).toBeGreaterThan(60);
    expect(added.body.data.warnings.map((w: { code: string }) => w.code)).toContain(
      'protein_above_target',
    );
    expect(added.body.data.isFeasible).toBe(false);
  });

  it('merges a repeat product into the existing line instead of duplicating it', async () => {
    const created = await createPlan();
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});
    const day = generated.body.data.days[0];
    const carbItem = day.items.find(
      (item: { componentType: string }) => item.componentType === 'carb',
    );

    const added = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/days/${day.id}/items`)
      .set(bearer(token))
      .send({ productId: carbItem.productId, componentType: 'carb', quantity: 1 });

    expect(added.status).toBe(201);
    expect(added.body.data.items).toHaveLength(day.items.length);
    const merged = added.body.data.items.find(
      (item: { productId: string }) => item.productId === carbItem.productId,
    );
    expect(merged.quantity).toBe(carbItem.quantity + 1);
    expect(Number(merged.lineTotal)).toBeCloseTo(Number(carbItem.unitPrice) * merged.quantity, 2);
  });

  it('locks an approved plan against further edits', async () => {
    const created = await createPlan();
    const planId = created.body.data.id as string;

    const tooEarly = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/approve`)
      .set(bearer(token));
    expect(tooEarly.status).toBe(409);

    await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});

    const approved = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/approve`)
      .set(bearer(token));
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('approved');

    const edit = await request(app)
      .patch(`/api/v1/dashboard/meal-plans/${planId}`)
      .set(bearer(token))
      .send({ headcount: 10 });
    expect(edit.status).toBe(409);

    const regenerate = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});
    expect(regenerate.status).toBe(409);

    const duplicated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/duplicate`)
      .set(bearer(token));
    expect(duplicated.status).toBe(201);
    expect(duplicated.body.data.status).toBe('draft');
    expect(duplicated.body.data.name).toContain('(copy)');
  });

  it('generates a long plan in one transaction', async () => {
    const created = await createPlan({ startDate: '2026-05-01', endDate: '2026-06-14' });
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(token))
      .send({});

    expect(generated.status).toBe(200);
    expect(generated.body.data.days).toHaveLength(45);
    expect(generated.body.data.days.every((d: { items: unknown[] }) => d.items.length === 3)).toBe(
      true,
    );
  });

  it('rejects a plan longer than the day cap', async () => {
    const res = await createPlan({ startDate: '2026-05-01', endDate: '2026-12-31' });
    expect(res.status).toBe(400);
  });

  it('rejects an inverted date range', async () => {
    const res = await createPlan({ startDate: '2026-04-10', endDate: '2026-04-06' });
    expect(res.status).toBe(422);
  });

  it('archives a plan and hides it from the list', async () => {
    const created = await createPlan();
    const planId = created.body.data.id as string;

    const archived = await request(app)
      .delete(`/api/v1/dashboard/meal-plans/${planId}`)
      .set(bearer(token));
    expect(archived.status).toBe(204);

    const list = await request(app)
      .get('/api/v1/dashboard/meal-plans')
      .set(bearer(token))
      .query({ companyId });
    expect(list.body.data.some((p: { id: string }) => p.id === planId)).toBe(false);
  });

  it('requires dashboard authentication', async () => {
    const res = await request(app).get('/api/v1/dashboard/meal-plans');
    expect(res.status).toBe(401);
  });
});

describe('Company meal plan self-service', () => {
  let dashToken = '';
  let companyToken = '';
  let otherCompanyToken = '';
  let companyId = '';
  let categoryId = '';
  const suffix = `mpc-${Date.now()}`;
  const products: Record<string, string> = {};

  async function seedProduct(
    name: string,
    price: string,
    nutrition: { componentType: string; caloriesKcal: number; proteinG: number; carbsG: number; fatG: number },
  ) {
    const created = await request(app)
      .post('/api/v1/dashboard/catalog/products')
      .set(bearer(dashToken))
      .send({ categoryId, name, basePrice: price, currency: 'EGP', visibility: 'public' });
    await request(app)
      .put(`/api/v1/dashboard/catalog/products/${created.body.data.id}/nutrition`)
      .set(bearer(dashToken))
      .send({ ...nutrition, allergens: [] });
    return created.body.data.id as string;
  }

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    dashToken = dash.body.data.accessToken as string;

    const reg = await registerCompany(suffix);
    companyId = reg.body.data.companyId as string;
    const login = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: `user-${suffix}@example.com`, password: 'SecurePass123!' });
    companyToken = login.body.data.accessToken as string;

    const otherSuffix = `${suffix}-other`;
    await registerCompany(otherSuffix);
    const otherLogin = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: `user-${otherSuffix}@example.com`, password: 'SecurePass123!' });
    otherCompanyToken = otherLogin.body.data.accessToken as string;

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(dashToken))
      .send({ name: `Canteen ${suffix}`, slug: `canteen-${suffix}` });
    categoryId = category.body.data.id as string;

    products.cheapProtein = await seedProduct(`Protein cheap ${suffix}`, '9.00', {
      componentType: 'protein', caloriesKcal: 250, proteinG: 30, carbsG: 5, fatG: 8,
    });
    products.pricyProtein = await seedProduct(`Protein pricy ${suffix}`, '15.00', {
      componentType: 'protein', caloriesKcal: 420, proteinG: 48, carbsG: 9, fatG: 15,
    });
    products.hugeProtein = await seedProduct(`Protein huge ${suffix}`, '95.00', {
      componentType: 'protein', caloriesKcal: 700, proteinG: 60, carbsG: 12, fatG: 40,
    });
    products.carb = await seedProduct(`Carb ${suffix}`, '5.00', {
      componentType: 'carb', caloriesKcal: 300, proteinG: 6, carbsG: 60, fatG: 3,
    });
  });

  async function createGeneratedPlan() {
    const created = await request(app)
      .post('/api/v1/dashboard/meal-plans')
      .set(bearer(dashToken))
      .send({
        companyId,
        name: `Client plan ${suffix}`,
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        headcount: 50,
        budgetPerMeal: '25.00',
        currency: 'EGP',
        slots: [
          { componentType: 'protein', quantity: 1 },
          { componentType: 'carb', quantity: 1 },
        ],
        minProteinG: 30,
        varietyWindowDays: 0,
      });
    const planId = created.body.data.id as string;
    await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(dashToken))
      .send({});
    return planId;
  }

  it('hides draft plans from the client and shows released ones', async () => {
    const draft = await request(app)
      .post('/api/v1/dashboard/meal-plans')
      .set(bearer(dashToken))
      .send({
        companyId,
        name: `Draft ${suffix}`,
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        headcount: 10,
        budgetPerMeal: '25.00',
        currency: 'EGP',
        slots: [{ componentType: 'protein', quantity: 1 }],
      });
    const draftId = draft.body.data.id as string;
    const releasedId = await createGeneratedPlan();

    const list = await request(app)
      .get('/api/v1/company/meal-plans')
      .set(bearer(companyToken));

    expect(list.status).toBe(200);
    const ids = list.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(releasedId);
    expect(ids).not.toContain(draftId);
  });

  it('does not leak another company plan', async () => {
    const planId = await createGeneratedPlan();
    const res = await request(app)
      .get(`/api/v1/company/meal-plans/${planId}`)
      .set(bearer(otherCompanyToken));
    expect(res.status).toBe(404);
  });

  it('offers swap options flagged by affordability', async () => {
    const planId = await createGeneratedPlan();
    const plan = await request(app)
      .get(`/api/v1/company/meal-plans/${planId}`)
      .set(bearer(companyToken));
    const day = plan.body.data.days[0];
    const proteinItem = day.items.find((i: { componentType: string }) => i.componentType === 'protein');

    const options = await request(app)
      .get(`/api/v1/company/meal-plans/${planId}/days/${day.id}/items/${proteinItem.id}/options`)
      .set(bearer(companyToken));

    expect(options.status).toBe(200);
    const byId = Object.fromEntries(
      options.body.data.map((o: { productId: string }) => [o.productId, o]),
    );
    expect(byId[products.pricyProtein!].withinBudget).toBe(true);
    expect(byId[products.hugeProtein!].withinBudget).toBe(false);
    // Affordable options are listed before unaffordable ones.
    expect(options.body.data[0].withinBudget).toBe(true);
  });

  it('applies an affordable swap and recomputes the day', async () => {
    const planId = await createGeneratedPlan();
    const plan = await request(app)
      .get(`/api/v1/company/meal-plans/${planId}`)
      .set(bearer(companyToken));
    const day = plan.body.data.days[0];
    const proteinItem = day.items.find((i: { componentType: string }) => i.componentType === 'protein');

    const swap = await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/days/${day.id}/items/${proteinItem.id}/swap`)
      .set(bearer(companyToken))
      .send({ productId: products.pricyProtein });

    expect(swap.status).toBe(200);
    const swapped = swap.body.data.items.find(
      (i: { componentType: string }) => i.componentType === 'protein',
    );
    expect(swapped.productId).toBe(products.pricyProtein);
    expect(swapped.isLocked).toBe(true);
    expect(Number(swapped.unitPrice)).toBeCloseTo(15, 2);

    // The day total is the other slots plus the newly chosen protein.
    const othersCost = day.items
      .filter((i: { componentType: string }) => i.componentType !== 'protein')
      .reduce((sum: number, i: { lineTotal: string }) => sum + Number(i.lineTotal), 0);
    expect(Number(swap.body.data.costPerHead)).toBeCloseTo(othersCost + 15, 2);
  });

  it('refuses a swap that breaks the agreed budget', async () => {
    const planId = await createGeneratedPlan();
    const plan = await request(app)
      .get(`/api/v1/company/meal-plans/${planId}`)
      .set(bearer(companyToken));
    const day = plan.body.data.days[0];
    const proteinItem = day.items.find((i: { componentType: string }) => i.componentType === 'protein');

    const swap = await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/days/${day.id}/items/${proteinItem.id}/swap`)
      .set(bearer(companyToken))
      .send({ productId: products.hugeProtein });

    expect(swap.status).toBe(400);
    expect(swap.body.error.message).toContain('over the agreed');
  });

  it('refuses a swap into the wrong component slot', async () => {
    const planId = await createGeneratedPlan();
    const plan = await request(app)
      .get(`/api/v1/company/meal-plans/${planId}`)
      .set(bearer(companyToken));
    const day = plan.body.data.days[0];
    const proteinItem = day.items.find((i: { componentType: string }) => i.componentType === 'protein');

    const swap = await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/days/${day.id}/items/${proteinItem.id}/swap`)
      .set(bearer(companyToken))
      .send({ productId: products.carb });

    expect(swap.status).toBe(400);
  });

  it('requires company authentication', async () => {
    const res = await request(app).get('/api/v1/company/meal-plans');
    expect(res.status).toBe(401);
    const asDashboard = await request(app)
      .get('/api/v1/company/meal-plans')
      .set(bearer(dashToken));
    expect(asDashboard.status).toBe(401);
  });
});

describe('Confirming a plan places the orders', () => {
  let dashToken = '';
  let companyToken = '';
  let companyId = '';
  const suffix = `mpo-${Date.now()}`;

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    dashToken = dash.body.data.accessToken as string;

    const reg = await registerCompany(suffix);
    companyId = reg.body.data.companyId as string;
    await request(app)
      .post(`/api/v1/dashboard/companies/${companyId}/approve`)
      .set(bearer(dashToken))
      .send({ reason: 'test' });

    const login = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: `user-${suffix}@example.com`, password: 'SecurePass123!' });
    companyToken = login.body.data.accessToken as string;

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(dashToken))
      .send({ name: `Orders ${suffix}`, slug: `orders-${suffix}` });
    const categoryId = category.body.data.id as string;

    const productIds: string[] = [];
    for (const spec of [
      { name: `Order protein ${suffix}`, price: '20.00', componentType: 'protein', proteinG: 40 },
      { name: `Order carb ${suffix}`, price: '10.00', componentType: 'carb', proteinG: 6 },
    ]) {
      const created = await request(app)
        .post('/api/v1/dashboard/catalog/products')
        .set(bearer(dashToken))
        .send({ categoryId, name: spec.name, basePrice: spec.price, currency: 'EGP', visibility: 'public' });
      await request(app)
        .put(`/api/v1/dashboard/catalog/products/${created.body.data.id}/nutrition`)
        .set(bearer(dashToken))
        .send({
          componentType: spec.componentType,
          caloriesKcal: 400,
          proteinG: spec.proteinG,
          carbsG: 40,
          fatG: 10,
          allergens: [],
        });
      productIds.push(created.body.data.id as string);
    }

    // Ordering needs a menu assigned to the company.
    const menu = await request(app)
      .post('/api/v1/dashboard/menus')
      .set(bearer(dashToken))
      .send({ name: `Order menu ${suffix}`, menuType: 'standard', isActive: true });
    const menuId = menu.body.data.id as string;
    const section = await request(app)
      .post(`/api/v1/dashboard/menus/${menuId}/sections`)
      .set(bearer(dashToken))
      .send({ name: 'All', sortOrder: 1 });
    for (const productId of productIds) {
      await request(app)
        .post(`/api/v1/dashboard/menus/${menuId}/sections/${section.body.data.id}/products`)
        .set(bearer(dashToken))
        .send({ productId, sortOrder: 1 });
    }
    await request(app)
      .post(`/api/v1/dashboard/menus/${menuId}/assignments`)
      .set(bearer(dashToken))
      .send({ scopeType: 'company', scopeId: companyId, priority: 50 });
  });

  it('creates one order per plan day and refuses to bill twice', async () => {
    const created = await request(app)
      .post('/api/v1/dashboard/meal-plans')
      .set(bearer(dashToken))
      .send({
        companyId,
        name: `Order plan ${suffix}`,
        startDate: '2026-09-07',
        endDate: '2026-09-09',
        headcount: 40,
        budgetPerMeal: '60.00',
        currency: 'EGP',
        slots: [
          { componentType: 'protein', quantity: 1 },
          { componentType: 'carb', quantity: 1 },
        ],
        varietyWindowDays: 0,
      });
    const planId = created.body.data.id as string;

    const generated = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(dashToken))
      .send({});
    expect(generated.body.data.days).toHaveLength(3);

    const confirm = await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/confirm`)
      .set(bearer(companyToken))
      .send({ fulfillmentType: 'pickup' });

    expect(confirm.status).toBe(201);
    expect(confirm.body.data.orderIds).toHaveLength(3);
    expect(confirm.body.data.plan.status).toBe('approved');

    // Quantities are per head, not per plan.
    const order = await request(app)
      .get(`/api/v1/company/orders/${confirm.body.data.orderIds[0]}`)
      .set(bearer(companyToken));
    expect(order.status).toBe(200);
    for (const item of order.body.data.items) {
      expect(item.quantity % 40).toBe(0);
    }

    const again = await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/confirm`)
      .set(bearer(companyToken))
      .send({ fulfillmentType: 'pickup' });
    expect(again.status).toBe(409);
  });

  it('requires a delivery address for delivery orders', async () => {
    const created = await request(app)
      .post('/api/v1/dashboard/meal-plans')
      .set(bearer(dashToken))
      .send({
        companyId,
        name: `Delivery plan ${suffix}`,
        startDate: '2026-09-14',
        endDate: '2026-09-15',
        headcount: 20,
        budgetPerMeal: '60.00',
        currency: 'EGP',
        slots: [{ componentType: 'protein', quantity: 1 }],
      });
    const planId = created.body.data.id as string;
    await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(dashToken))
      .send({});

    const confirm = await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/confirm`)
      .set(bearer(companyToken))
      .send({ fulfillmentType: 'delivery' });
    expect(confirm.status).toBe(400);
  });
});
