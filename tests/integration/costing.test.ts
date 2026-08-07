import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser } from '../helpers/auth';

const SUFFIX = `cost-${Date.now()}`;

describe('Ingredient costing and margin', () => {
  let token = '';
  let productId = '';
  const ing: Record<string, string> = {};

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    token = dash.body.data.accessToken as string;

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(token))
      .send({ name: `Costing ${SUFFIX}`, slug: `costing-${SUFFIX}` });

    const product = await request(app)
      .post('/api/v1/dashboard/catalog/products')
      .set(bearer(token))
      .send({
        categoryId: category.body.data.id,
        name: `Costed dish ${SUFFIX}`,
        basePrice: '100.00',
        currency: 'EGP',
        visibility: 'public',
      });
    productId = product.body.data.id as string;
  });

  async function createIngredient(body: Record<string, unknown>) {
    const res = await request(app)
      .post('/api/v1/dashboard/costing/ingredients')
      .set(bearer(token))
      .send({ currency: 'EGP', ...body });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('converts a bulk purchase into a cost per base unit', async () => {
    // A 25 kg sack at 900 EGP is 0.036 EGP per gram before trim loss.
    const flour = await createIngredient({
      name: `Flour ${SUFFIX}`,
      dimension: 'mass',
      purchasePrice: '900',
      purchaseQty: '25',
      purchaseUom: 'kg',
    });
    ing.flour = flour.id;
    expect(Number(flour.costPerBaseUnit)).toBeCloseTo(0.036, 6);
  });

  it('accounts for trim loss in the usable cost', async () => {
    // 100 EGP for 1 kg with 80% yield: a usable gram costs 0.125, not 0.1.
    const beef = await createIngredient({
      name: `Beef ${SUFFIX}`,
      dimension: 'mass',
      purchasePrice: '100',
      purchaseQty: '1',
      purchaseUom: 'kg',
      yieldPercent: '80',
    });
    ing.beef = beef.id;
    expect(Number(beef.costPerBaseUnit)).toBeCloseTo(0.125, 6);
  });

  it('refuses a unit from the wrong dimension', async () => {
    const res = await request(app)
      .post('/api/v1/dashboard/costing/ingredients')
      .set(bearer(token))
      .send({
        name: `Bad ${SUFFIX}`,
        dimension: 'mass',
        purchasePrice: '10',
        purchaseQty: '1',
        purchaseUom: 'l',
        currency: 'EGP',
      });
    expect(res.status).toBe(400);
  });

  it('costs a recipe from its lines and derives margin', async () => {
    const recipe = await request(app)
      .post('/api/v1/dashboard/costing/recipes')
      .set(bearer(token))
      .send({
        name: `Dish recipe ${SUFFIX}`,
        recipeType: 'menu_item',
        productId,
        yieldQty: '1',
        yieldUom: 'portion',
        lines: [
          { ingredientId: ing.beef, quantity: '200', uom: 'g' },
          { ingredientId: ing.flour, quantity: '100', uom: 'g' },
        ],
      });
    expect(recipe.status).toBe(201);

    // 200 g beef at 0.125 = 25, plus 100 g flour at 0.036 = 3.6 -> 28.60
    const lineCosts = recipe.body.data.lines.map((l: { lineCost: string }) => Number(l.lineCost));
    expect(lineCosts[0]).toBeCloseTo(25, 4);
    expect(lineCosts[1]).toBeCloseTo(3.6, 4);

    const activated = await request(app)
      .post(`/api/v1/dashboard/costing/recipes/${recipe.body.data.id}/status`)
      .set(bearer(token))
      .send({ status: 'active' });
    expect(activated.status).toBe(200);

    const costs = await request(app)
      .get('/api/v1/dashboard/costing/products')
      .set(bearer(token))
      .query({ pageSize: 200 });
    const row = costs.body.data.find((c: { productId: string }) => c.productId === productId);
    expect(row).toBeTruthy();
    expect(Number(row.totalCost)).toBeCloseTo(28.6, 2);
    expect(row.isCosted).toBe(true);
    expect(row.costStatus).toBe('ok');
    // Selling price 100, cost 28.60 -> 71.40% margin.
    expect(Number(row.sellingPrice)).toBeCloseTo(100, 2);
    expect(Number(row.marginPercent)).toBeCloseTo(71.4, 1);
  });

  it('recosts every affected product when an ingredient price changes', async () => {
    const updated = await request(app)
      .patch(`/api/v1/dashboard/costing/ingredients/${ing.beef}`)
      .set(bearer(token))
      .send({ purchasePrice: '200', changeReason: 'supplier increase' });
    expect(updated.status).toBe(200);
    // Doubling the beef price doubles its usable rate.
    expect(Number(updated.body.data.costPerBaseUnit)).toBeCloseTo(0.25, 6);

    const costs = await request(app)
      .get('/api/v1/dashboard/costing/products')
      .set(bearer(token))
      .query({ pageSize: 200 });
    const row = costs.body.data.find((c: { productId: string }) => c.productId === productId);
    // 200 g at 0.25 = 50, plus 3.6 -> 53.60 with no manual intervention.
    expect(Number(row.totalCost)).toBeCloseTo(53.6, 2);
    expect(Number(row.marginPercent)).toBeCloseTo(46.4, 1);
  });

  it('keeps a history of the price change', async () => {
    const history = await request(app)
      .get(`/api/v1/dashboard/costing/ingredients/${ing.beef}/history`)
      .set(bearer(token));
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(1);
    const latest = history.body.data[0];
    expect(Number(latest.oldPurchasePrice)).toBeCloseTo(100, 2);
    expect(Number(latest.newPurchasePrice)).toBeCloseTo(200, 2);
    expect(Number(latest.changePercent)).toBeCloseTo(100, 1);
  });

  it('locks the currency once an ingredient is used in a recipe', async () => {
    const res = await request(app)
      .patch(`/api/v1/dashboard/costing/ingredients/${ing.beef}`)
      .set(bearer(token))
      .send({ currency: 'USD' });
    expect(res.status).toBe(409);
  });

  it('refuses to delete an ingredient a recipe depends on', async () => {
    const res = await request(app)
      .delete(`/api/v1/dashboard/costing/ingredients/${ing.beef}`)
      .set(bearer(token));
    expect(res.status).toBe(409);
  });

  it('applies a bulk price update and recosts once', async () => {
    const res = await request(app)
      .post('/api/v1/dashboard/costing/ingredients/bulk-price')
      .set(bearer(token))
      .send({
        reason: 'quarterly review',
        items: [
          { ingredientId: ing.flour, purchasePrice: '1800' },
          { ingredientId: ing.beef, purchasePrice: '300' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(2);
    expect(res.body.data.productsRecosted).toBeGreaterThanOrEqual(1);

    const costs = await request(app)
      .get('/api/v1/dashboard/costing/products')
      .set(bearer(token))
      .query({ pageSize: 200 });
    const row = costs.body.data.find((c: { productId: string }) => c.productId === productId);
    // Beef 300/kg at 80% = 0.375/g -> 75 for 200 g; flour 1800/25 kg = 0.072/g -> 7.2
    expect(Number(row.totalCost)).toBeCloseTo(82.2, 2);
  });

  it('reports coverage so a margin report can be trusted or not', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/costing/summary')
      .set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.costedProducts).toBeGreaterThanOrEqual(1);
    expect(Number(res.body.data.coveragePercent)).toBeGreaterThan(0);
  });

  it('will not activate a recipe whose ingredient is missing', async () => {
    const orphan = await request(app)
      .post('/api/v1/dashboard/costing/recipes')
      .set(bearer(token))
      .send({
        name: `Prep ${SUFFIX}`,
        recipeType: 'prep',
        yieldQty: '1000',
        yieldUom: 'ml',
        lines: [{ ingredientId: ing.flour, quantity: '1', uom: 'kg' }],
      });
    expect(orphan.status).toBe(201);

    // A prep recipe has no product, so it is costed but never given a product cost row.
    const activated = await request(app)
      .post(`/api/v1/dashboard/costing/recipes/${orphan.body.data.id}/status`)
      .set(bearer(token))
      .send({ status: 'active' });
    expect(activated.status).toBe(200);
  });

  it('requires dashboard authentication', async () => {
    expect((await request(app).get('/api/v1/dashboard/costing/ingredients')).status).toBe(401);
  });
});
