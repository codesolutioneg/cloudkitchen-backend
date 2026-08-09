import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser, registerCompany } from '../helpers/auth';

const SUFFIX = `prod-${Date.now()}`;
const DAY = '2027-05-10';

/** The kitchen's daily prep list, aggregated across every client. */
describe('Production planning', () => {
  let dashToken = '';
  const companyTokens: string[] = [];
  let productA = '';
  let productB = '';

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    dashToken = dash.body.data.accessToken as string;

    const category = await request(app)
      .post('/api/v1/dashboard/catalog/categories')
      .set(bearer(dashToken))
      .send({ name: `Prod ${SUFFIX}`, slug: `prod-${SUFFIX}` });
    const categoryId = category.body.data.id as string;

    const mk = async (name: string, price: string, component: string) => {
      const p = await request(app)
        .post('/api/v1/dashboard/catalog/products')
        .set(bearer(dashToken))
        .send({ categoryId, name, basePrice: price, currency: 'EGP', visibility: 'public' });
      await request(app)
        .put(`/api/v1/dashboard/catalog/products/${p.body.data.id}/nutrition`)
        .set(bearer(dashToken))
        .send({
          componentType: component,
          caloriesKcal: 300,
          proteinG: 20,
          carbsG: 30,
          fatG: 8,
          allergens: [],
        });
      return p.body.data.id as string;
    };
    productA = await mk(`Prod chicken ${SUFFIX}`, '700.00', 'protein');
    productB = await mk(`Prod rice ${SUFFIX}`, '400.00', 'carb');

    const menu = await request(app)
      .post('/api/v1/dashboard/menus')
      .set(bearer(dashToken))
      .send({ name: `Prod menu ${SUFFIX}`, menuType: 'standard', isActive: true });
    const section = await request(app)
      .post(`/api/v1/dashboard/menus/${menu.body.data.id}/sections`)
      .set(bearer(dashToken))
      .send({ name: 'All', sortOrder: 1 });
    for (const productId of [productA, productB]) {
      await request(app)
        .post(`/api/v1/dashboard/menus/${menu.body.data.id}/sections/${section.body.data.id}/products`)
        .set(bearer(dashToken))
        .send({ productId, sortOrder: 1 });
    }

    // Two companies ordering the same dishes on the same day is the whole point.
    for (const n of [1, 2]) {
      const suffix = `${SUFFIX}-${n}`;
      const reg = await registerCompany(suffix);
      const companyId = reg.body.data.companyId as string;
      await request(app)
        .post(`/api/v1/dashboard/companies/${companyId}/approve`)
        .set(bearer(dashToken))
        .send({ reason: 'test' });
      await request(app)
        .post(`/api/v1/dashboard/menus/${menu.body.data.id}/assignments`)
        .set(bearer(dashToken))
        .send({ scopeType: 'company', scopeId: companyId, priority: 80 + n });

      const login = await request(app)
        .post('/api/v1/auth/company/login')
        .send({ email: `user-${suffix}@example.com`, password: 'SecurePass123!' });
      const token = login.body.data.accessToken as string;
      companyTokens.push(token);

      const order = await request(app)
        .post('/api/v1/company/orders')
        .set(bearer(token))
        .send({
          items: [
            { productId: productA, quantity: n * 10 },
            { productId: productB, quantity: n * 5 },
          ],
          requestedDeliveryAt: `${DAY}T12:00:00.000Z`,
          fulfillmentType: 'pickup',
          sourceChannel: 'web',
        });
      expect(order.status).toBe(201);
    }
  });

  it('consolidates the same dish across every client', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/production/day/${DAY}`)
      .set(bearer(dashToken));

    expect(res.status).toBe(200);
    const chicken = res.body.data.lines.find(
      (l: { productId: string }) => l.productId === productA,
    );
    const rice = res.body.data.lines.find((l: { productId: string }) => l.productId === productB);

    // 10 + 20 portions of chicken, 5 + 10 of rice, from two companies.
    expect(chicken.plannedQty).toBe(30);
    expect(rice.plannedQty).toBe(15);
    expect(chicken.companyCount).toBe(2);
    expect(chicken.orderCount).toBe(2);
    expect(res.body.data.companyCount).toBe(2);
    expect(res.body.data.orderCount).toBe(2);
    expect(res.body.data.totalPortions).toBe(45);
  });

  it('separates committed from unconfirmed work', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/production/day/${DAY}`)
      .set(bearer(dashToken));
    const chicken = res.body.data.lines.find(
      (l: { productId: string }) => l.productId === productA,
    );
    // Fresh orders are not yet paid or accepted, so nothing is committed.
    expect(chicken.unconfirmedQty).toBe(30);
    expect(chicken.confirmedQty).toBe(0);
    expect(chicken.producedQty).toBe(0);
  });

  it('groups a day by client for packing', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/production/day/${DAY}/by-company`)
      .set(bearer(dashToken));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const totalPortions = res.body.data.reduce(
      (sum: number, c: { portions: number }) => sum + c.portions,
      0,
    );
    expect(totalPortions).toBe(45);
    expect(res.body.data[0].orders[0].items.length).toBeGreaterThan(0);
  });

  it('reports an empty day rather than failing', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/production/day/2027-05-11')
      .set(bearer(dashToken));
    expect(res.status).toBe(200);
    expect(res.body.data.totalPortions).toBe(0);
    expect(res.body.data.lines).toEqual([]);
  });

  it('locks a day into a snapshot that later orders cannot change', async () => {
    const locked = await request(app)
      .post('/api/v1/dashboard/production/plans')
      .set(bearer(dashToken))
      .send({ date: DAY });

    expect(locked.status).toBe(201);
    expect(locked.body.data.snapshotVersion).toBe(1);
    expect(locked.body.data.totalPortions).toBe(45);
    const planId = locked.body.data.id as string;

    // A new order after the lock must not alter the snapshot.
    await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(companyTokens[0]!))
      .send({
        items: [{ productId: productA, quantity: 7 }],
        requestedDeliveryAt: `${DAY}T12:00:00.000Z`,
        fulfillmentType: 'pickup',
        sourceChannel: 'web',
      });

    const snapshot = await request(app)
      .get(`/api/v1/dashboard/production/plans/${planId}`)
      .set(bearer(dashToken));
    expect(snapshot.body.data.totalPortions).toBe(45);

    // The live view does move.
    const live = await request(app)
      .get(`/api/v1/dashboard/production/day/${DAY}`)
      .set(bearer(dashToken));
    expect(live.body.data.totalPortions).toBe(52);
  });

  it('supersedes rather than edits when a day is locked again', async () => {
    const second = await request(app)
      .post('/api/v1/dashboard/production/plans')
      .set(bearer(dashToken))
      .send({ date: DAY });

    expect(second.status).toBe(201);
    expect(second.body.data.snapshotVersion).toBe(2);
    expect(second.body.data.totalPortions).toBe(52);

    const list = await request(app)
      .get('/api/v1/dashboard/production/plans')
      .set(bearer(dashToken))
      .query({ from: DAY, to: DAY });
    // Both versions survive, so an earlier shift's sheet is still recoverable.
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses to lock a day with nothing to cook', async () => {
    const res = await request(app)
      .post('/api/v1/dashboard/production/plans')
      .set(bearer(dashToken))
      .send({ date: '2027-05-12' });
    expect(res.status).toBe(400);
  });

  it('moves a plan through its states', async () => {
    const list = await request(app)
      .get('/api/v1/dashboard/production/plans')
      .set(bearer(dashToken))
      .query({ from: DAY, to: DAY });
    const planId = list.body.data[0].id as string;

    const started = await request(app)
      .post(`/api/v1/dashboard/production/plans/${planId}/status`)
      .set(bearer(dashToken))
      .send({ status: 'in_production' });
    expect(started.body.data.status).toBe('in_production');
    expect(started.body.data.startedAt).not.toBeNull();

    const done = await request(app)
      .post(`/api/v1/dashboard/production/plans/${planId}/status`)
      .set(bearer(dashToken))
      .send({ status: 'completed' });
    expect(done.body.data.completedAt).not.toBeNull();
  });

  it('requires dashboard authentication', async () => {
    expect((await request(app).get(`/api/v1/dashboard/production/day/${DAY}`)).status).toBe(401);
  });
});
