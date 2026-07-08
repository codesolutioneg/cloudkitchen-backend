import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import {
  bearer,
  loginCompanyUser,
  loginDashboardUser,
  registerCompany,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} from '../helpers/auth';
import { setupOrderableCompany, buildOrderPayload } from '../helpers/orderFixtures';

describe('Security hardening (pre-launch §25)', () => {
  it('rejects company JWT on dashboard routes', async () => {
    const suffix = Date.now();
    const reg = await registerCompany(`sec-co-${suffix}`);
    const login = await loginCompanyUser(`user-sec-co-${suffix}@example.com`, 'SecurePass123!');
    const companyToken = login.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/dashboard/companies')
      .set(bearer(companyToken));

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('rejects dashboard JWT on company order routes', async () => {
    const dash = await loginDashboardUser();
    const dashToken = dash.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/company/orders')
      .set(bearer(dashToken));

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('enforces tenant isolation on company order detail', async () => {
    const suffix = Date.now();
    const ctxA = await setupOrderableCompany(suffix);
    const ctxB = await setupOrderableCompany(suffix + 1);

    const order = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctxA.companyToken))
      .send(buildOrderPayload());

    expect(order.status).toBe(201);
    const orderId = order.body.data.id as string;

    const crossTenant = await request(app)
      .get(`/api/v1/company/orders/${orderId}`)
      .set(bearer(ctxB.companyToken));

    expect([403, 404]).toContain(crossTenant.status);
    expect(crossTenant.body.success).toBe(false);
  });

  it('rejects illegal workflow transition without valid toStepId', async () => {
    const suffix = Date.now() + 100;
    const ctx = await setupOrderableCompany(suffix);

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload());

    const orderId = create.body.data.id as string;

    const badTransition = await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/transitions`)
      .set(bearer(ctx.dashToken))
      .send({ toStepId: '00000000-0000-4000-8000-000000009999', comment: 'invalid step' });

    expect(badTransition.status).toBeGreaterThanOrEqual(400);
    expect(badTransition.body.success).toBe(false);
  });

  it('returns standard success envelope on health', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.error).toBeUndefined();
  });

  it('returns standard error envelope on unauthorized dashboard access', async () => {
    const res = await request(app).get('/api/v1/dashboard/companies');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
    expect(res.body.data).toBeUndefined();
  });

  it('dashboard super admin can authenticate with seeded credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/dashboard/login')
      .send({ email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });
});
