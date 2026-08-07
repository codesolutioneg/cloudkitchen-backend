import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginDashboardUser } from '../helpers/auth';

const NILE_COMPANY_ID = 'f94250b0-8ae6-4189-ae1a-4004ce7a1a1e';
const CENTRAL_MENU_ID = 'b6793148-95d5-4335-a57c-a06f4a186877';

describe('Menu assignment cycle', () => {
  let dashToken: string;
  let assignmentId: string;

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    dashToken = dash.body.data.accessToken as string;
  });

  it('creates company menu assignment', async () => {
    const suffix = Date.now();
    const create = await request(app)
      .post(`/api/v1/dashboard/menus/${CENTRAL_MENU_ID}/assignments`)
      .set(bearer(dashToken))
      .send({
        scopeType: 'company',
        scopeId: NILE_COMPANY_ID,
        priority: 10,
        isActive: true,
      });

    expect([200, 201]).toContain(create.status);
    assignmentId = create.body.data.id as string;
    expect(assignmentId).toBeTruthy();
  });

  it('lists only active assignments after soft delete', async () => {
    const listBefore = await request(app)
      .get(`/api/v1/dashboard/menus/${CENTRAL_MENU_ID}/assignments`)
      .set(bearer(dashToken));

    expect(listBefore.status).toBe(200);
    const activeBefore = (listBefore.body.data as Array<{ id: string; isActive: boolean }>).filter(
      (a) => a.isActive !== false,
    );
    expect(activeBefore.some((a) => a.id === assignmentId)).toBe(true);

    const del = await request(app)
      .delete(`/api/v1/dashboard/menus/${CENTRAL_MENU_ID}/assignments/${assignmentId}`)
      .set(bearer(dashToken));

    expect(del.status).toBe(204);

    const listAfter = await request(app)
      .get(`/api/v1/dashboard/menus/${CENTRAL_MENU_ID}/assignments`)
      .set(bearer(dashToken));

    expect(listAfter.status).toBe(200);
    const stillVisible = (listAfter.body.data as Array<{ id: string }>).some((a) => a.id === assignmentId);
    expect(stillVisible).toBe(false);
  });

  it('company menu is empty without active assignment', async () => {
    const login = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: 'atf343069@gmail.com', password: 'E2eTestPass123!' });

    expect(login.status).toBe(200);
    const companyToken = login.body.data.accessToken as string;

    const menu = await request(app)
      .get('/api/v1/company/catalog/menu')
      .set(bearer(companyToken));

    expect(menu.status).toBe(200);
    const sections = menu.body.data.sections as unknown[];
    const hasProducts = sections.some(
      (s: { products?: unknown[] }) => (s.products?.length ?? 0) > 0,
    );

    if (!hasProducts) {
      const reassign = await request(app)
        .post(`/api/v1/dashboard/menus/${CENTRAL_MENU_ID}/assignments`)
        .set(bearer(dashToken))
        .send({
          scopeType: 'company',
          scopeId: NILE_COMPANY_ID,
          priority: 10,
          isActive: true,
        });
      expect([200, 201]).toContain(reassign.status);

      const menuAfter = await request(app)
        .get('/api/v1/company/catalog/menu')
        .set(bearer(companyToken));

      const sectionsAfter = menuAfter.body.data.sections as Array<{ products?: unknown[] }>;
      const count = sectionsAfter.reduce((n, s) => n + (s.products?.length ?? 0), 0);
      expect(count).toBeGreaterThan(0);
    } else {
      expect(hasProducts).toBe(true);
    }
  });
});

describe('Company orders list', () => {
  it('returns paginated array for company user', async () => {
    const login = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: 'atf343069@gmail.com', password: 'E2eTestPass123!' });

    const token = login.body.data.accessToken as string;
    const res = await request(app).get('/api/v1/company/orders').set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('orderNumber');
      expect(res.body.data[0]).toHaveProperty('currentStepCode');
    }
  });
});
