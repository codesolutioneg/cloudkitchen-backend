import request from 'supertest';
import app from '../../src/app';
import { bearer, loginCompanyUser, loginDashboardUser, registerCompany } from './auth';

/** Seeded catalog IDs from prisma/seed.ts — stable across test runs. */
export const SEED_PRODUCT_ID = '00000000-0000-4000-8000-000000000102';
export const SEED_MENU_ID = '00000000-0000-4000-8000-000000000103';
export const SEED_ORDER_APPROVAL_WORKFLOW_ID = '00000000-0000-4000-8000-000000000201';

export const CHICKEN_MEAL_NAME = 'Chicken Meal';
export const CHICKEN_MEAL_UNIT_PRICE = '45.00';
export const CHICKEN_MEAL_CURRENCY = 'SAR';
export const DEFAULT_VAT_RATE = 0.15;
export const COMPANY_USER_PASSWORD = 'SecurePass123!';

export function futureDeliveryIso(hoursFromNow = 48): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

export function buildOrderPayload(overrides: {
  productId?: string;
  quantity?: number;
  requestedDeliveryAt?: string;
  fulfillmentType?: 'pickup' | 'delivery';
} = {}) {
  return {
    items: [
      {
        productId: overrides.productId ?? SEED_PRODUCT_ID,
        quantity: overrides.quantity ?? 2,
      },
    ],
    requestedDeliveryAt: overrides.requestedDeliveryAt ?? futureDeliveryIso(48),
    fulfillmentType: overrides.fulfillmentType ?? 'pickup',
    sourceChannel: 'api',
  };
}

export interface OrderableCompanyContext {
  suffix: number;
  companyId: string;
  companyToken: string;
  companyEmail: string;
  dashToken: string;
}

/** Registers, approves, assigns seeded menu — ready to place orders. */
export async function setupOrderableCompany(suffix: number): Promise<OrderableCompanyContext> {
  const dash = await loginDashboardUser();
  const dashToken = dash.body.data.accessToken as string;

  const reg = await registerCompany(`orders-${suffix}`);
  const companyId = reg.body.data.companyId as string;
  const companyEmail = `user-orders-${suffix}@example.com`;

  const approve = await request(app)
    .post(`/api/v1/dashboard/companies/${companyId}/approve`)
    .set(bearer(dashToken))
    .send({ reason: `Approved for integration tests batch ${suffix}` });
  if (approve.status !== 200) {
    throw new Error(`Company approve failed: ${approve.status} ${JSON.stringify(approve.body)}`);
  }

  const assignment = await request(app)
    .post(`/api/v1/dashboard/menus/${SEED_MENU_ID}/assignments`)
    .set(bearer(dashToken))
    .send({ scopeType: 'company', scopeId: companyId, priority: 10 });
  if (assignment.status !== 201) {
    throw new Error(`Menu assignment failed: ${assignment.status} ${JSON.stringify(assignment.body)}`);
  }

  const login = await loginCompanyUser(companyEmail, COMPANY_USER_PASSWORD);
  const companyToken = login.body.data.accessToken as string;

  return { suffix, companyId, companyToken, companyEmail, dashToken };
}
