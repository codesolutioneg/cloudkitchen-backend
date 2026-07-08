import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { execSync } from 'child_process';
import app from '../../src/app';
import {
  bearer,
  loginCompanyUser,
  loginDashboardUser,
  registerCompany,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} from '../helpers/auth';

describe('Auth module', () => {
  beforeAll(() => {
    execSync('npm run db:seed', { cwd: process.cwd(), stdio: 'pipe' });
  });

  it('company login returns tokens for registered user', async () => {
    const suffix = Date.now();
    const reg = await registerCompany(suffix);
    expect(reg.status).toBe(201);

    const login = await loginCompanyUser(`user-${suffix}@example.com`, 'SecurePass123!');
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
    expect(login.body.data.refreshToken).toBeTruthy();
  });

  it('company OTP verify issues tokens', async () => {
    const suffix = Date.now() + 1;
    await registerCompany(suffix);

    const send = await request(app)
      .post('/api/v1/auth/company/otp/send')
      .send({ email: `user-${suffix}@example.com`, purpose: 'login' });
    expect(send.status).toBe(204);

    const verify = await request(app)
      .post('/api/v1/auth/company/otp/verify')
      .send({
        email: `user-${suffix}@example.com`,
        code: '123456',
        purpose: 'login',
      });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();
  });

  it('dashboard login works for seeded super admin', async () => {
    const login = await loginDashboardUser();
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
  });

  it('rejects company token on dashboard route', async () => {
    const suffix = Date.now() + 2;
    const reg = await registerCompany(suffix);
    const login = await loginCompanyUser(`user-${suffix}@example.com`, 'SecurePass123!');
    const companyToken = login.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/auth/dashboard/me')
      .set(bearer(companyToken));
    expect(res.status).toBe(401);
  });

  it('rejects dashboard token on company profile', async () => {
    const dash = await loginDashboardUser();
    const dashToken = dash.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/company/profile')
      .set(bearer(dashToken));
    expect(res.status).toBe(401);
  });

  it('GET /company/profile returns own company', async () => {
    const suffix = Date.now() + 3;
    const reg = await registerCompany(suffix);
    const login = await loginCompanyUser(`user-${suffix}@example.com`, 'SecurePass123!');

    const res = await request(app)
      .get('/api/v1/company/profile')
      .set(bearer(login.body.data.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.company.id).toBe(reg.body.data.companyId);
    expect(res.body.data.user.email).toBe(`user-${suffix}@example.com`);
  });

  it('GET /auth/dashboard/me returns super admin roles', async () => {
    const login = await loginDashboardUser(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    const res = await request(app)
      .get('/api/v1/auth/dashboard/me')
      .set(bearer(login.body.data.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(SUPER_ADMIN_EMAIL);
    expect(res.body.data.roles.some((r: { name: string }) => r.name === 'Super Admin')).toBe(
      true,
    );
  });
});
