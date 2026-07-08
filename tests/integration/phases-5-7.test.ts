import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../src/app';
import {
  bearer,
  loginDashboardUser,
  registerCompany,
  loginCompanyUser,
} from '../helpers/auth';

describe('Business rules module', () => {
  it('creates rule type and company-scoped business rule', async () => {
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;
    const suffix = Date.now();

    const ruleType = await request(app)
      .post('/api/v1/dashboard/rules/rule-types')
      .set(bearer(token))
      .send({
        code: `test_moq_${suffix}`,
        name: `Test MOQ ${suffix}`,
        valueSchema: { type: 'number' },
      });
    expect(ruleType.status).toBe(201);

    const reg = await registerCompany(`rules-${suffix}`);
    const companyId = reg.body.data.companyId as string;

    const rule = await request(app)
      .post('/api/v1/dashboard/rules/business-rules')
      .set(bearer(token))
      .send({
        ruleTypeId: ruleType.body.data.id,
        scopeType: 'company',
        scopeId: companyId,
        value: { minQty: 10 },
        priority: 5,
      });
    expect(rule.status).toBe(201);

    const resolved = await request(app)
      .get('/api/v1/dashboard/rules/business-rules/resolve')
      .query({ ruleTypeCode: `test_moq_${suffix}`, companyId })
      .set(bearer(token));

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.value).toEqual({ minQty: 10 });
  });

  it('creates calendar with blackout event', async () => {
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;
    const suffix = Date.now();

    const calendar = await request(app)
      .post('/api/v1/dashboard/rules/calendars')
      .set(bearer(token))
      .send({ name: `SA Holidays ${suffix}`, countryCode: 'SA' });
    expect(calendar.status).toBe(201);

    const event = await request(app)
      .post(`/api/v1/dashboard/rules/calendars/${calendar.body.data.id}/events`)
      .set(bearer(token))
      .send({
        eventDate: '2026-12-01',
        eventType: 'blackout',
        name: `National Day ${suffix}`,
      });
    expect(event.status).toBe(201);
    expect(event.body.data.eventType).toBe('blackout');
  });
});

describe('Settings module', () => {
  it('company reads resolved settings with global fallback', async () => {
    const suffix = Date.now();
    const reg = await registerCompany(`settings-${suffix}`);
    const login = await loginCompanyUser(`user-settings-${suffix}@example.com`, 'SecurePass123!');
    const token = login.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/company/settings')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('rejects company override of non-overridable global setting', async () => {
    const dash = await loginDashboardUser();
    const dashToken = dash.body.data.accessToken as string;
    const suffix = Date.now();

    const reg = await registerCompany(`locked-${suffix}`);
    const companyId = reg.body.data.companyId as string;

    const attempt = await request(app)
      .put(`/api/v1/dashboard/settings/company/${companyId}`)
      .set(bearer(dashToken))
      .send({ 'notification.order_confirmation.channel': 'sms' });

    expect(attempt.status).toBe(403);
  });
});

describe('Workflow engine', () => {
  it('lists seeded default order workflow', async () => {
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;

    const res = await request(app)
      .get('/api/v1/dashboard/workflows')
      .set(bearer(token));

    expect(res.status).toBe(200);
    expect(
      res.body.data.some((w: { workflowType: string }) => w.workflowType === 'order'),
    ).toBe(true);
  });

  it('creates workflow instance and transitions step', async () => {
    const dash = await loginDashboardUser();
    const token = dash.body.data.accessToken as string;
    const suffix = Date.now();
    const entityId = randomUUID();

    const workflows = await request(app)
      .get('/api/v1/dashboard/workflows')
      .query({ workflowType: 'order' })
      .set(bearer(token));
    const workflowId = workflows.body.data[0].id as string;

    const steps = await request(app)
      .get(`/api/v1/dashboard/workflows/${workflowId}/steps`)
      .set(bearer(token));
    const submittedStep = steps.body.data.find((s: { code: string }) => s.code === 'submitted');
    const pendingStep = steps.body.data.find(
      (s: { code: string }) => s.code === 'pending_approval',
    );

    const create = await request(app)
      .post('/api/v1/dashboard/workflow-instances')
      .set(bearer(token))
      .send({
        workflowType: 'order',
        entityType: 'order',
        entityId,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.currentStepId).toBe(submittedStep.id);

    const transition = await request(app)
      .post(`/api/v1/dashboard/workflow-instances/${create.body.data.id}/transition`)
      .set(bearer(token))
      .send({ toStepId: pendingStep.id, comment: `Move to review ${suffix}` });

    expect(transition.status).toBe(200);
    expect(transition.body.data.currentStepId).toBe(pendingStep.id);
  });
});
