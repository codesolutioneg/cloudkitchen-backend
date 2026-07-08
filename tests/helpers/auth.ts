import request from 'supertest';
import app from '../../src/app';

export const SUPER_ADMIN_EMAIL = 'admin@cloudkitchen.example';
export const SUPER_ADMIN_PASSWORD = 'Admin@12345';

export async function loginCompanyUser(email: string, password: string) {
  const res = await request(app)
    .post('/api/v1/auth/company/login')
    .send({ email, password });
  return res;
}

export async function loginDashboardUser(
  email = SUPER_ADMIN_EMAIL,
  password = SUPER_ADMIN_PASSWORD,
) {
  const res = await request(app)
    .post('/api/v1/auth/dashboard/login')
    .send({ email, password });
  return res;
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function registerCompany(suffix: number | string) {
  return request(app)
    .post('/api/v1/company/onboarding/register')
    .send({
      legalName: `Test Kitchen ${suffix}`,
      countryCode: 'SA',
      primaryContactName: 'Contact',
      primaryEmail: `company-${suffix}@example.com`,
      primaryPhone: '+966500000001',
      userFullName: 'User',
      userEmail: `user-${suffix}@example.com`,
      password: 'SecurePass123!',
    });
}
