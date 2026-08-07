import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser, registerCompany } from '../helpers/auth';

const SUFFIX = `ci-${Date.now()}`;

/** Costing has to reach the places that spend money: orders and plan margin. */
describe('Costing joins up with orders and plans', () => {
  let dashToken = '';
  let companyToken = '';
  let companyId = '';
  let proteinId = '';
  let carbId = '';
  let planId = '';

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    dashToken = dash.body.data.accessToken as string;

    const reg = await registerCompany(SUFFIX);
    companyId = reg.body.data.companyId as string;
    await request(app)
      .post(`/api/v1/dashboard/companies/${companyId}/approve`)
      .set(bearer(dashToken))
      .send({ reason: 'test' });
    const login = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: `user-${SUFFIX}@example.com`, password: 'SecurePass123!' });
    companyToken = login.body.data.accessToken as string;

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(dashToken))
      .send({ name: `CI ${SUFFIX}`, slug: `ci-${SUFFIX}` });
    const categoryId = category.body.data.id as string;

    const mk = async (name: string, price: string, component: string, diet: string[]) => {
      const p = await request(app)
        .post('/api/v1/dashboard/catalog/products')
        .set(bearer(dashToken))
        .send({ categoryId, name, basePrice: price, currency: 'EGP', visibility: 'public' });
      await request(app)
        .put(`/api/v1/dashboard/catalog/products/${p.body.data.id}/nutrition`)
        .set(bearer(dashToken))
        .send({
          componentType: component,
          caloriesKcal: 400,
          proteinG: 30,
          carbsG: 40,
          fatG: 10,
          allergens: [],
          dietTags: diet,
        });
      return p.body.data.id as string;
    };

    proteinId = await mk(`CI protein ${SUFFIX}`, '50.00', 'protein', ['halal']);
    carbId = await mk(`CI carb ${SUFFIX}`, '20.00', 'carb', ['halal', 'vegetarian']);

    // An ingredient and a recipe so the protein has a real food cost.
    const ing = await request(app)
      .post('/api/v1/dashboard/costing/ingredients')
      .set(bearer(dashToken))
      .send({
        name: `CI chicken ${SUFFIX}`,
        dimension: 'mass',
        purchasePrice: '120',
        purchaseQty: '1',
        purchaseUom: 'kg',
        currency: 'EGP',
      });
    const recipe = await request(app)
      .post('/api/v1/dashboard/costing/recipes')
      .set(bearer(dashToken))
      .send({
        name: `CI recipe ${SUFFIX}`,
        recipeType: 'menu_item',
        productId: proteinId,
        yieldQty: '1',
        yieldUom: 'portion',
        lines: [{ ingredientId: ing.body.data.id, quantity: '250', uom: 'g' }],
      });
    await request(app)
      .post(`/api/v1/dashboard/costing/recipes/${recipe.body.data.id}/status`)
      .set(bearer(dashToken))
      .send({ status: 'active' });

    const menu = await request(app)
      .post('/api/v1/dashboard/menus')
      .set(bearer(dashToken))
      .send({ name: `CI menu ${SUFFIX}`, menuType: 'standard', isActive: true });
    const section = await request(app)
      .post(`/api/v1/dashboard/menus/${menu.body.data.id}/sections`)
      .set(bearer(dashToken))
      .send({ name: 'All', sortOrder: 1 });
    for (const productId of [proteinId, carbId]) {
      await request(app)
        .post(`/api/v1/dashboard/menus/${menu.body.data.id}/sections/${section.body.data.id}/products`)
        .set(bearer(dashToken))
        .send({ productId, sortOrder: 1 });
    }
    await request(app)
      .post(`/api/v1/dashboard/menus/${menu.body.data.id}/assignments`)
      .set(bearer(dashToken))
      .send({ scopeType: 'company', scopeId: companyId, priority: 99 });
  });

  it('stamps the food cost on an order line when the order is placed', async () => {
    const plan = await request(app)
      .post('/api/v1/dashboard/meal-plans')
      .set(bearer(dashToken))
      .send({
        companyId,
        name: `CI plan ${SUFFIX}`,
        startDate: '2027-01-04',
        endDate: '2027-01-05',
        headcount: 10,
        budgetPerMeal: '100.00',
        currency: 'EGP',
        slots: [
          { componentType: 'protein', quantity: 1 },
          { componentType: 'carb', quantity: 1 },
        ],
        varietyWindowDays: 0,
      });
    planId = plan.body.data.id as string;
    await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/generate`)
      .set(bearer(dashToken))
      .send({});

    const confirm = await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/confirm`)
      .set(bearer(companyToken))
      .send({ fulfillmentType: 'pickup' });
    expect(confirm.status).toBe(201);

    // 250 g at 0.12/g = 30.00 stamped against the protein line.
    const margin = await request(app)
      .get(`/api/v1/dashboard/meal-plans/${planId}/margin`)
      .set(bearer(dashToken));
    expect(margin.status).toBe(200);
    expect(Number(margin.body.data.foodCostPerHead)).toBeCloseTo(60, 2); // 30 per day, two days
    expect(Number(margin.body.data.revenuePerHead)).toBeCloseTo(140, 2); // 70 per day
    expect(Number(margin.body.data.marginPerHead)).toBeCloseTo(80, 2);
    expect(Number(margin.body.data.marginPercent)).toBeCloseTo(57.14, 1);
    expect(Number(margin.body.data.planMargin)).toBeCloseTo(800, 2); // x10 heads
  });

  it('reports how much of the plan the margin actually covers', async () => {
    const margin = await request(app)
      .get(`/api/v1/dashboard/meal-plans/${planId}/margin`)
      .set(bearer(dashToken));
    // The carb has no recipe, so half the lines are uncosted and we say so.
    expect(margin.body.data.uncostedLines).toBeGreaterThan(0);
    expect(Number(margin.body.data.costCoveragePercent)).toBeLessThan(100);
  });

  it('honours a halal requirement as a hard filter', async () => {
    const nonHalal = await request(app)
      .post('/api/v1/dashboard/catalog/products')
      .set(bearer(dashToken))
      .send({
        categoryId: (
          await request(app)
            .post('/api/v1/dashboard/catalog/categories')
            .set(bearer(dashToken))
            .send({ name: `CI2 ${SUFFIX}`, slug: `ci2-${SUFFIX}` })
        ).body.data.id,
        name: `CI pork ${SUFFIX}`,
        basePrice: '5.00',
        currency: 'EGP',
        visibility: 'public',
      });
    await request(app)
      .put(`/api/v1/dashboard/catalog/products/${nonHalal.body.data.id}/nutrition`)
      .set(bearer(dashToken))
      .send({
        componentType: 'protein',
        caloriesKcal: 400,
        proteinG: 30,
        carbsG: 5,
        fatG: 20,
        allergens: [],
        dietTags: [],
      });

    const preview = await request(app)
      .post('/api/v1/dashboard/meal-plans/preview')
      .set(bearer(dashToken))
      .send({
        companyId,
        startDate: '2027-02-01',
        endDate: '2027-02-01',
        headcount: 5,
        budgetPerMeal: '100.00',
        slots: [{ componentType: 'protein', quantity: 1 }],
        requireDietTags: ['halal'],
        varietyWindowDays: 0,
      });

    expect(preview.status).toBe(200);
    const picked = preview.body.data.days[0].items.map((i: { productId: string }) => i.productId);
    // The cheapest protein is the non-halal one; the requirement must beat price.
    expect(picked).not.toContain(nonHalal.body.data.id);
    expect(picked).toContain(proteinId);
  });

  it('says which constraint emptied the pool', async () => {
    const preview = await request(app)
      .post('/api/v1/dashboard/meal-plans/preview')
      .set(bearer(dashToken))
      .send({
        companyId,
        startDate: '2027-02-01',
        endDate: '2027-02-01',
        headcount: 5,
        budgetPerMeal: '100.00',
        slots: [{ componentType: 'protein', quantity: 1 }],
        requireDietTags: ['kosher'],
        varietyWindowDays: 0,
      });

    expect(preview.body.data.warnings.map((w: { code: string }) => w.code)).toContain(
      'diet_requirement_unmet',
    );
  });
});
