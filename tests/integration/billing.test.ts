import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser, registerCompany } from '../helpers/auth';

const SUFFIX = `bill-${Date.now()}`;

describe('Billing terms, invoices and instalments', () => {
  let dashToken = '';
  let companyToken = '';
  let otherToken = '';
  let companyId = '';

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

    const otherSuffix = `${SUFFIX}-o`;
    await registerCompany(otherSuffix);
    const otherLogin = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: `user-${otherSuffix}@example.com`, password: 'SecurePass123!' });
    otherToken = otherLogin.body.data.accessToken as string;
  });

  it('defaults an unconfigured company to pay per order', async () => {
    const res = await request(app)
      .get('/api/v1/company/billing/terms')
      .set(bearer(companyToken));
    expect(res.status).toBe(200);
    expect(res.body.data.paymentMode).toBe('per_order');
    expect(res.body.data.netDays).toBe(0);
  });

  it('puts a company on monthly terms', async () => {
    const res = await request(app)
      .put(`/api/v1/dashboard/companies/${companyId}/billing-terms`)
      .set(bearer(dashToken))
      .send({
        paymentMode: 'monthly_invoice',
        netDays: 30,
        creditLimit: '50000.00',
        currency: 'EGP',
        poReference: 'PO-2026-001',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.paymentMode).toBe('monthly_invoice');
    expect(res.body.data.netDays).toBe(30);

    const mine = await request(app)
      .get('/api/v1/company/billing/terms')
      .set(bearer(companyToken));
    expect(mine.body.data.creditLimit).toBe('50000');
    expect(mine.body.data.poReference).toBe('PO-2026-001');
  });

  it('refuses to invoice a period with nothing billable', async () => {
    const res = await request(app)
      .post(`/api/v1/dashboard/companies/${companyId}/invoices`)
      .set(bearer(dashToken))
      .send({ periodStart: '2020-01-01', periodEnd: '2020-01-31' });
    expect(res.status).toBe(400);
  });

  it('rejects an inverted invoice period', async () => {
    const res = await request(app)
      .post(`/api/v1/dashboard/companies/${companyId}/invoices`)
      .set(bearer(dashToken))
      .send({ periodStart: '2026-03-31', periodEnd: '2026-03-01' });
    expect(res.status).toBe(400);
  });

  it('summarises what the company owes when nothing is open', async () => {
    const res = await request(app)
      .get('/api/v1/company/billing/summary')
      .set(bearer(companyToken));
    expect(res.status).toBe(200);
    expect(res.body.data.openInvoiceCount).toBe(0);
    expect(res.body.data.outstandingAmount).toBe('0.00');
    expect(res.body.data.nextInstalment).toBeNull();
    // A credit limit is set, so remaining credit is reported.
    expect(res.body.data.creditRemaining).toBe('50000.00');
  });

  it('does not leak another company invoices', async () => {
    const mine = await request(app).get('/api/v1/company/invoices').set(bearer(otherToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toEqual([]);
  });

  it('requires the right audience on each surface', async () => {
    expect((await request(app).get('/api/v1/company/billing/summary')).status).toBe(401);
    expect(
      (await request(app).get('/api/v1/company/billing/summary').set(bearer(dashToken))).status,
    ).toBe(401);
    expect(
      (await request(app).get('/api/v1/dashboard/invoices').set(bearer(companyToken))).status,
    ).toBe(401);
  });
});

describe('Splitting a confirmed plan into instalments', () => {
  let dashToken = '';
  let companyToken = '';
  let companyId = '';
  let planId = '';
  const suffix = `inst-${Date.now()}`;

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
      .send({ name: `Bill ${suffix}`, slug: `bill-${suffix}` });
    const categoryId = category.body.data.id as string;

    const ids: string[] = [];
    for (const spec of [
      { name: `Bill protein ${suffix}`, price: '25.00', componentType: 'protein' },
      { name: `Bill carb ${suffix}`, price: '10.00', componentType: 'carb' },
    ]) {
      const created = await request(app)
        .post('/api/v1/dashboard/catalog/products')
        .set(bearer(dashToken))
        .send({ categoryId, name: spec.name, basePrice: spec.price, currency: 'EGP', visibility: 'public' });
      await request(app)
        .put(`/api/v1/dashboard/catalog/products/${created.body.data.id}/nutrition`)
        .set(bearer(dashToken))
        .send({ componentType: spec.componentType, caloriesKcal: 400, proteinG: 30, carbsG: 40, fatG: 10, allergens: [] });
      ids.push(created.body.data.id as string);
    }

    const menu = await request(app)
      .post('/api/v1/dashboard/menus')
      .set(bearer(dashToken))
      .send({ name: `Bill menu ${suffix}`, menuType: 'standard', isActive: true });
    const menuId = menu.body.data.id as string;
    const section = await request(app)
      .post(`/api/v1/dashboard/menus/${menuId}/sections`)
      .set(bearer(dashToken))
      .send({ name: 'All', sortOrder: 1 });
    for (const productId of ids) {
      await request(app)
        .post(`/api/v1/dashboard/menus/${menuId}/sections/${section.body.data.id}/products`)
        .set(bearer(dashToken))
        .send({ productId, sortOrder: 1 });
    }
    await request(app)
      .post(`/api/v1/dashboard/menus/${menuId}/assignments`)
      .set(bearer(dashToken))
      .send({ scopeType: 'company', scopeId: companyId, priority: 95 });

    const plan = await request(app)
      .post('/api/v1/dashboard/meal-plans')
      .set(bearer(dashToken))
      .send({
        companyId,
        name: `Instalment plan ${suffix}`,
        startDate: '2026-11-02',
        endDate: '2026-11-04',
        headcount: 100,
        budgetPerMeal: '60.00',
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
  });

  it('refuses instalments before the plan is confirmed', async () => {
    const res = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/instalments`)
      .set(bearer(dashToken))
      .send({ count: 3, firstDueDate: '2026-11-05' });
    expect(res.status).toBe(409);
  });

  it('splits a confirmed plan into instalments that sum to the total', async () => {
    await request(app)
      .post(`/api/v1/company/meal-plans/${planId}/confirm`)
      .set(bearer(companyToken))
      .send({ fulfillmentType: 'pickup' });

    const res = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/instalments`)
      .set(bearer(dashToken))
      .send({ count: 3, firstDueDate: '2026-11-05', everyDays: 7 });

    expect(res.status).toBe(201);
    const invoice = res.body.data;
    expect(invoice.instalments).toHaveLength(3);
    expect(invoice.status).toBe('issued');

    // Rounding must land on the last instalment, never drift away from the total.
    const sum = invoice.instalments.reduce(
      (acc: number, i: { amount: string }) => acc + Number(i.amount),
      0,
    );
    expect(sum).toBeCloseTo(Number(invoice.totalAmount), 2);

    const dates = invoice.instalments.map((i: { dueAt: string }) => i.dueAt);
    expect(dates).toEqual(['2026-11-05', '2026-11-12', '2026-11-19']);
  });

  it('refuses a second invoice for the same plan', async () => {
    const res = await request(app)
      .post(`/api/v1/dashboard/meal-plans/${planId}/instalments`)
      .set(bearer(dashToken))
      .send({ count: 2, firstDueDate: '2026-12-01' });
    expect(res.status).toBe(409);
  });

  it('walks proof, approval and invoice status through to paid', async () => {
    const mine = await request(app).get('/api/v1/company/invoices').set(bearer(companyToken));
    const invoice = mine.body.data[0];
    expect(invoice.instalments).toHaveLength(3);

    const summary = await request(app)
      .get('/api/v1/company/billing/summary')
      .set(bearer(companyToken));
    expect(summary.body.data.nextInstalment.sequence).toBe(1);
    expect(Number(summary.body.data.outstandingAmount)).toBeGreaterThan(0);

    // Approving instalments one at a time moves the invoice part_paid then paid.
    for (const [index, instalment] of invoice.instalments.entries()) {
      const decided = await request(app)
        .post(`/api/v1/dashboard/instalments/${instalment.id}/decide`)
        .set(bearer(dashToken))
        .send({ decision: 'approved' });
      expect(decided.status).toBe(200);
      expect(decided.body.data.status).toBe(index === 2 ? 'paid' : 'part_paid');
    }

    const after = await request(app)
      .get(`/api/v1/company/invoices/${invoice.id}`)
      .set(bearer(companyToken));
    expect(after.body.data.status).toBe('paid');
    expect(after.body.data.outstandingAmount).toBe('0.00');
  });
});
