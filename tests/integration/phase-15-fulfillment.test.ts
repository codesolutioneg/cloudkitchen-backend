import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { bearer, loginCompanyUser, loginDashboardUser, registerCompany } from '../helpers/auth';
import { buildOrderPayload, setupOrderableCompany } from '../helpers/orderFixtures';

const DELIVERY_EMAIL = 'delivery@cloudkitchen.example';
const DELIVERY_PASSWORD = 'Delivery@12345';

async function loginDeliveryUser() {
  const res = await request(app)
    .post('/api/v1/auth/dashboard/login')
    .send({ email: DELIVERY_EMAIL, password: DELIVERY_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

async function advanceOrderToReady(
  dashToken: string,
  companyToken: string,
  orderId: string,
  workflowId: string,
) {
  const stepsRes = await request(app)
    .get(`/api/v1/dashboard/workflows/${workflowId}/steps`)
    .set(bearer(dashToken));
  const steps = stepsRes.body.data as Array<{ id: string; code: string }>;

  const transition = async (toCode: string) => {
    const step = steps.find((s) => s.code === toCode);
    await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/transitions`)
      .set(bearer(dashToken))
      .send({ toStepId: step!.id, comment: `E2E → ${toCode}` });
  };

  await transition('pending_approval');
  await transition('kitchen_accepted');
  await transition('preparing');
  await transition('ready');
}

describe('Phase 15 — Fulfillment (delivery + pickup)', () => {
  let dashToken: string;
  let deliveryToken: string;

  beforeAll(async () => {
    const dash = await loginDashboardUser();
    dashToken = dash.body.data.accessToken as string;
    deliveryToken = await loginDeliveryUser();
  });

  it('delivery flow: assign → depart → QR confirm delivers order with address', async () => {
    const suffix = Date.now();
    const ctx = await setupOrderableCompany(suffix);
    const companyLogin = await loginCompanyUser(ctx.companyEmail, 'SecurePass123!');
    const companyToken = companyLogin.body.data.accessToken as string;

    const address = await request(app)
      .post('/api/v1/company/onboarding/addresses')
      .set(bearer(companyToken))
      .send({
        addressType: 'delivery',
        label: `HQ ${suffix}`,
        addressLine1: 'King Fahd Road',
        city: 'Riyadh',
        stateProvince: 'Riyadh Province',
        countryCode: 'SA',
        latitude: 24.7136,
        longitude: 46.6753,
        contactName: 'Receiving Desk',
        contactPhone: '+966500000099',
        isDefault: true,
      });
    expect(address.status).toBe(201);
    const addressId = address.body.data.id as string;

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(companyToken))
      .send({
        ...buildOrderPayload({ quantity: 1 }),
        fulfillmentType: 'delivery',
        deliveryAddressId: addressId,
      });
    expect(create.status).toBe(201);
    const orderId = create.body.data.id as string;

    const workflows = await request(app)
      .get('/api/v1/dashboard/workflows')
      .query({ workflowType: 'order' })
      .set(bearer(dashToken));
    const workflowId = workflows.body.data[0].id as string;

    await advanceOrderToReady(dashToken, companyToken, orderId, workflowId);

    const deliveryUsers = await request(app)
      .get('/api/v1/dashboard/delivery/users')
      .set(bearer(dashToken));
    expect(deliveryUsers.status).toBe(200);
    const driver = deliveryUsers.body.data.find(
      (u: { email: string; isAvailable: boolean }) =>
        u.email === DELIVERY_EMAIL && u.isAvailable,
    );
    expect(driver).toBeDefined();

    const assign = await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/assign-delivery`)
      .set(bearer(dashToken))
      .send({ deliveryUserId: driver.id });
    expect(assign.status).toBe(200);

    const depart = await request(app)
      .post(`/api/v1/dashboard/delivery/orders/${orderId}/depart`)
      .set(bearer(deliveryToken));
    expect(depart.status).toBe(200);
    expect(depart.body.data.currentStepCode).toBe('out_for_delivery');
    expect(depart.body.data.deliveryAddress.latitude).toBe('24.7136');

    const qr = await request(app)
      .get(`/api/v1/company/orders/${orderId}/fulfillment-qr`)
      .set(bearer(companyToken));
    expect(qr.status).toBe(200);
    expect(qr.body.data.qrPayload).toBeTruthy();

    const myOrders = await request(app)
      .get('/api/v1/dashboard/delivery/orders')
      .set(bearer(deliveryToken));
    expect(myOrders.status).toBe(200);
    expect(myOrders.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);

    const confirm = await request(app)
      .post(`/api/v1/dashboard/delivery/orders/${orderId}/confirm-delivery`)
      .set(bearer(deliveryToken))
      .send({ qrToken: qr.body.data.qrPayload });
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.currentStepCode).toBe('delivered');
  });

  it('blocks assigning a second order while delivery user has an active assignment', async () => {
    const suffix = Date.now() + 1;
    const ctx = await setupOrderableCompany(suffix);
    const companyToken = (await loginCompanyUser(ctx.companyEmail, 'SecurePass123!')).body.data
      .accessToken as string;

    const address = await request(app)
      .post('/api/v1/company/onboarding/addresses')
      .set(bearer(companyToken))
      .send({
        addressType: 'delivery',
        label: 'Branch',
        addressLine1: 'Street 1',
        city: 'Jeddah',
        latitude: 21.4858,
        longitude: 39.1925,
        isDefault: true,
      });

    const createOrder = async () => {
      const res = await request(app)
        .post('/api/v1/company/orders')
        .set(bearer(companyToken))
        .send({
          ...buildOrderPayload(),
          fulfillmentType: 'delivery',
          deliveryAddressId: address.body.data.id,
        });
      return res.body.data.id as string;
    };

    const orderA = await createOrder();
    const orderB = await createOrder();

    const workflowId = (
      await request(app)
        .get('/api/v1/dashboard/workflows')
        .query({ workflowType: 'order' })
        .set(bearer(dashToken))
    ).body.data[0].id as string;

    await advanceOrderToReady(dashToken, companyToken, orderA, workflowId);
    await advanceOrderToReady(dashToken, companyToken, orderB, workflowId);

    const driver = (
      await request(app).get('/api/v1/dashboard/delivery/users').set(bearer(dashToken))
    ).body.data.find((u: { email: string }) => u.email === DELIVERY_EMAIL);

    const firstAssign = await request(app)
      .post(`/api/v1/dashboard/orders/${orderA}/assign-delivery`)
      .set(bearer(dashToken))
      .send({ deliveryUserId: driver.id });
    expect(firstAssign.status).toBe(200);

    const secondAssign = await request(app)
      .post(`/api/v1/dashboard/orders/${orderB}/assign-delivery`)
      .set(bearer(dashToken))
      .send({ deliveryUserId: driver.id });
    expect(secondAssign.status).toBe(400);
    expect(secondAssign.body.error.message).toContain('already has active order');
  });

  it('pickup flow: ready → awaiting_pickup → picked_up', async () => {
    const suffix = Date.now() + 2;
    const ctx = await setupOrderableCompany(suffix);
    const companyToken = (await loginCompanyUser(ctx.companyEmail, 'SecurePass123!')).body.data
      .accessToken as string;

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(companyToken))
      .send({ ...buildOrderPayload(), fulfillmentType: 'pickup' });
    expect(create.status).toBe(201);
    const orderId = create.body.data.id as string;

    const workflowId = (
      await request(app)
        .get('/api/v1/dashboard/workflows')
        .query({ workflowType: 'order' })
        .set(bearer(dashToken))
    ).body.data[0].id as string;

    await advanceOrderToReady(dashToken, companyToken, orderId, workflowId);

    const awaiting = await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/awaiting-pickup`)
      .set(bearer(dashToken));
    expect(awaiting.status).toBe(200);
    expect(awaiting.body.data.currentStepCode).toBe('awaiting_pickup');

    const pickedUp = await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/confirm-pickup`)
      .set(bearer(dashToken));
    expect(pickedUp.status).toBe(200);
    expect(pickedUp.body.data.currentStepCode).toBe('picked_up');
  });
});
