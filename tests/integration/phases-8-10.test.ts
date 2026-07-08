import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../src/app';
import { bearer, loginDashboardUser, registerCompany, loginCompanyUser } from '../helpers/auth';
import {
  buildOrderPayload,
  CHICKEN_MEAL_CURRENCY,
  DEFAULT_VAT_RATE,
  SEED_ORDER_APPROVAL_WORKFLOW_ID,
  SEED_PRODUCT_ID,
  setupOrderableCompany,
} from '../helpers/orderFixtures';
import { approvalEngine } from '../../src/engines/approvalEngine';

describe('Phase 8 — Orders module', () => {
  it('rejects order when company is not approved', async () => {
    const suffix = Date.now();
    const reg = await registerCompany(`unapproved-${suffix}`);
    const login = await loginCompanyUser(`user-unapproved-${suffix}@example.com`, 'SecurePass123!');
    const token = login.body.data.accessToken as string;

    const res = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(token))
      .send(buildOrderPayload());

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('approved');
  });

  it('places order with Chicken Meal x2 and snapshots pricing', async () => {
    const suffix = Date.now();
    const ctx = await setupOrderableCompany(suffix);

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload({ quantity: 2 }));

    expect(create.status).toBe(201);
    expect(create.body.data.orderNumber).toMatch(/^ORD-\d{8}-[A-F0-9]{6}$/);
    expect(create.body.data.items).toHaveLength(1);
    expect(create.body.data.items[0].productNameSnapshot).toBe('Chicken Meal');
    expect(create.body.data.items[0].unitPriceSnapshot).toBe('45');
    expect(create.body.data.items[0].quantity).toBe(2);
    expect(create.body.data.currency).toBe(CHICKEN_MEAL_CURRENCY);
    expect(create.body.data.workflow.currentStepCode).toBe('submitted');

    const subtotal = 45 * 2;
    const tax = subtotal * DEFAULT_VAT_RATE;
    expect(Number(create.body.data.subtotalAmount)).toBe(subtotal);
    expect(Number(create.body.data.taxAmount)).toBeCloseTo(tax, 2);
    expect(Number(create.body.data.totalAmount)).toBeCloseTo(subtotal + tax, 2);
  });

  it('lists and retrieves order detail for company tenant', async () => {
    const suffix = Date.now() + 1;
    const ctx = await setupOrderableCompany(suffix);

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload({ quantity: 1 }));

    const orderId = create.body.data.id as string;

    const list = await request(app)
      .get('/api/v1/company/orders')
      .set(bearer(ctx.companyToken));

    expect(list.status).toBe(200);
    expect(list.body.data.some((o: { id: string }) => o.id === orderId)).toBe(true);

    const detail = await request(app)
      .get(`/api/v1/company/orders/${orderId}`)
      .set(bearer(ctx.companyToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.statusHistory[0].statusCode).toBe('submitted');
  });

  it('dashboard transitions order to pending_approval', async () => {
    const suffix = Date.now() + 2;
    const ctx = await setupOrderableCompany(suffix);

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload());

    const orderId = create.body.data.id as string;

    const workflows = await request(app)
      .get('/api/v1/dashboard/workflows')
      .query({ workflowType: 'order' })
      .set(bearer(ctx.dashToken));
    const workflowId = workflows.body.data[0].id as string;

    const steps = await request(app)
      .get(`/api/v1/dashboard/workflows/${workflowId}/steps`)
      .set(bearer(ctx.dashToken));
    const pendingStep = steps.body.data.find(
      (s: { code: string }) => s.code === 'pending_approval',
    );

    const transition = await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/transitions`)
      .set(bearer(ctx.dashToken))
      .send({ toStepId: pendingStep.id, comment: `Kitchen review ${suffix}` });

    expect(transition.status).toBe(200);
    expect(transition.body.data.workflow.currentStepCode).toBe('pending_approval');
  });

  it('company cancels order from submitted step', async () => {
    const suffix = Date.now() + 3;
    const ctx = await setupOrderableCompany(suffix);

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload());

    const orderId = create.body.data.id as string;

    const cancel = await request(app)
      .post(`/api/v1/company/orders/${orderId}/cancel`)
      .set(bearer(ctx.companyToken))
      .send({ reasonText: `Changed plans ${suffix}` });

    expect(cancel.status).toBe(200);
    expect(cancel.body.data.workflow.currentStepCode).toBe('cancelled');
  });

  it('company adds note; dashboard internal note hidden from company', async () => {
    const suffix = Date.now() + 4;
    const ctx = await setupOrderableCompany(suffix);

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload());

    const orderId = create.body.data.id as string;

    await request(app)
      .post(`/api/v1/company/orders/${orderId}/notes`)
      .set(bearer(ctx.companyToken))
      .send({ note: `Please pack separately ${suffix}` });

    await request(app)
      .post(`/api/v1/dashboard/orders/${orderId}/notes`)
      .set(bearer(ctx.dashToken))
      .send({ note: `VIP client ${suffix}`, isInternal: true });

    const companyView = await request(app)
      .get(`/api/v1/company/orders/${orderId}`)
      .set(bearer(ctx.companyToken));

    expect(companyView.body.data.notes).toHaveLength(1);
    expect(companyView.body.data.notes[0].note).toContain('pack separately');

    const dashView = await request(app)
      .get(`/api/v1/dashboard/orders/${orderId}`)
      .set(bearer(ctx.dashToken));

    expect(dashView.body.data.notes.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects company token on dashboard orders', async () => {
    const suffix = Date.now() + 5;
    const ctx = await setupOrderableCompany(suffix);

    const res = await request(app)
      .get('/api/v1/dashboard/orders')
      .set(bearer(ctx.companyToken));

    expect([401, 403]).toContain(res.status);
  });
});

describe('Phase 9 — Approval workflow engine', () => {
  it('lists seeded default order approval workflow', async () => {
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/dashboard/approval-workflows')
      .query({ entityType: 'order' })
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(
      res.body.data.some((w: { id: string }) => w.id === SEED_ORDER_APPROVAL_WORKFLOW_ID),
    ).toBe(true);
  });

  it('super admin approves approval request for an order', async () => {
    const suffix = Date.now() + 10;
    const ctx = await setupOrderableCompany(suffix);
    const dash = await loginDashboardUser();
    const dashToken = dash.body.data.accessToken as string;

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload());

    const orderId = create.body.data.id as string;

    const approvalRequest = await approvalEngine.createRequest({
      approvalWorkflowId: SEED_ORDER_APPROVAL_WORKFLOW_ID,
      entityType: 'order',
      entityId: orderId,
      requestedBy: { type: 'system', id: randomUUID() },
    });

    const decide = await request(app)
      .post(`/api/v1/dashboard/approval-requests/${approvalRequest.id}/decide`)
      .set(bearer(dashToken))
      .send({ decision: 'approved', comment: `Approved order ${suffix}` });

    expect(decide.status).toBe(200);
    expect(decide.body.data.status).toBe('approved');

    const detail = await request(app)
      .get(`/api/v1/dashboard/approval-requests/${approvalRequest.id}`)
      .set(bearer(dashToken));

    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('approved');
  });

  it('creates custom approval workflow with role step', async () => {
    const suffix = Date.now() + 11;
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;

    const roles = await request(app).get('/api/v1/dashboard/roles').set(bearer(token));
    const superAdminRole = roles.body.data.find(
      (r: { name: string }) => r.name === 'Super Admin',
    );

    const workflow = await request(app)
      .post('/api/v1/dashboard/approval-workflows')
      .set(bearer(token))
      .send({
        name: `High Value Order ${suffix}`,
        entityType: 'order',
        isActive: true,
      });

    expect(workflow.status).toBe(201);

    const step = await request(app)
      .post(`/api/v1/dashboard/approval-workflows/${workflow.body.data.id}/steps`)
      .set(bearer(token))
      .send({
        stepOrder: 1,
        name: 'Finance Review',
        approverType: 'role',
        approverRoleId: superAdminRole.id,
        requiredApprovalCount: 1,
      });

    expect(step.status).toBe(201);
    expect(step.body.data.approverType).toBe('role');
  });
});

describe('Phase 10 — Tracking timeline + audit logs', () => {
  it('returns timeline events for order tracking', async () => {
    const suffix = Date.now() + 20;
    const ctx = await setupOrderableCompany(suffix);

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload());

    const orderId = create.body.data.id as string;

    const tracking = await request(app)
      .get(`/api/v1/company/orders/${orderId}/tracking`)
      .set(bearer(ctx.companyToken));

    expect(tracking.status).toBe(200);
    expect(tracking.body.data.some((e: { eventCode: string }) => e.eventCode === 'order.created')).toBe(
      true,
    );
  });

  it('dashboard reads audit logs for created order entity', async () => {
    const suffix = Date.now() + 21;
    const ctx = await setupOrderableCompany(suffix);
    const dash = await loginDashboardUser();
    const dashToken = dash.body.data.accessToken as string;

    const create = await request(app)
      .post('/api/v1/company/orders')
      .set(bearer(ctx.companyToken))
      .send(buildOrderPayload());

    const orderId = create.body.data.id as string;

    const logs = await request(app)
      .get('/api/v1/dashboard/audit-logs')
      .query({ entityName: 'Order', entityId: orderId })
      .set(bearer(dashToken));

    expect(logs.status).toBe(200);
    expect(logs.body.data.length).toBeGreaterThan(0);
    expect(logs.body.data.some((l: { action: string }) => l.action === 'insert')).toBe(true);
    expect(logs.body.data.some((l: { entityName: string }) => l.entityName === 'Order')).toBe(
      true,
    );
  });

  it('rejects company token on audit logs', async () => {
    const suffix = Date.now() + 22;
    const ctx = await setupOrderableCompany(suffix);

    const res = await request(app)
      .get('/api/v1/dashboard/audit-logs')
      .set(bearer(ctx.companyToken));

    expect([401, 403]).toContain(res.status);
  });
});
