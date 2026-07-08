import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/prisma/client';
import { bearer } from '../helpers/auth';
import { setupOrderableCompany, SEED_PRODUCT_ID } from '../helpers/orderFixtures';
import { notificationEngine } from '../../src/engines/notificationEngine';
import { enqueueJob } from '../../src/jobs/jobQueue';
import { resolveTranslation } from '../../src/engines/localizationResolver';

const SEED_CATEGORY_ID = '00000000-0000-4000-8000-000000000101';

describe('Phases 11–13 — Notifications, Jobs, Integrations, Localization', () => {
  let dashToken: string;
  let companyToken: string;
  let companyUserId: string;
  let companyId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const ctx = await setupOrderableCompany(suffix);
    dashToken = ctx.dashToken;
    companyToken = ctx.companyToken;
    companyId = ctx.companyId;

    const user = await prisma.companyUser.findFirst({
      where: { email: ctx.companyEmail },
    });
    companyUserId = user!.id;
  });

  describe('Phase 11 — Notifications', () => {
    it('registers device token, lists notifications, and marks one read', async () => {
      const register = await request(app)
        .post('/api/v1/company/device-tokens')
        .set(bearer(companyToken))
        .send({ platform: 'android', token: `fcm-test-token-${Date.now()}` });

      expect(register.status).toBe(201);
      expect(register.body.data.platform).toBe('android');
      expect(register.body.data.isActive).toBe(true);

      await notificationEngine.queueNotification({
        templateCode: 'order_confirmation',
        channels: ['in_app'],
        recipientType: 'company_user',
        recipientId: companyUserId,
        recipientCompanyId: companyId,
        languageCode: 'en',
        variables: { orderNumber: 'ORD-TEST-001' },
      });

      const list = await request(app)
        .get('/api/v1/company/notifications')
        .set(bearer(companyToken));

      expect(list.status).toBe(200);
      expect(list.body.data.length).toBeGreaterThan(0);
      const notification = list.body.data.find(
        (n: { body: string }) => n.body.includes('ORD-TEST-001'),
      );
      expect(notification).toBeDefined();

      const markRead = await request(app)
        .post(`/api/v1/company/notifications/${notification.id}/read`)
        .set(bearer(companyToken));

      expect(markRead.status).toBe(200);
      expect(markRead.body.data.status).toBe('read');
      expect(markRead.body.data.readAt).toBeTruthy();
    });

    it('dashboard creates a notification template', async () => {
      const code = `test_alert_${Date.now()}`;
      const create = await request(app)
        .post('/api/v1/dashboard/notification-templates')
        .set(bearer(dashToken))
        .send({
          code,
          channel: 'in_app',
          bodyTemplate: 'Alert: {{message}}',
          subjectTemplate: 'Alert',
          languageCode: 'en',
        });

      expect(create.status).toBe(201);
      expect(create.body.data.code).toBe(code);

      const list = await request(app)
        .get('/api/v1/dashboard/notification-templates')
        .set(bearer(dashToken));

      expect(list.status).toBe(200);
      expect(list.body.data.some((t: { code: string }) => t.code === code)).toBe(true);
    });
  });

  describe('Phase 12 — Background Jobs + Integrations', () => {
    it('dashboard lists jobs after enqueue', async () => {
      const jobId = await enqueueJob({
        jobType: 'workflow.webhook',
        payload: { test: true, entityType: 'order', entityId: '00000000-0000-4000-8000-000000000099' },
        queueName: 'workflow',
      });

      const list = await request(app)
        .get('/api/v1/dashboard/jobs')
        .set(bearer(dashToken))
        .query({ jobType: 'workflow.webhook' });

      expect(list.status).toBe(200);
      expect(list.body.data.some((j: { id: string }) => j.id === jobId)).toBe(true);

      const detail = await request(app)
        .get(`/api/v1/dashboard/jobs/${jobId}`)
        .set(bearer(dashToken));

      expect(detail.status).toBe(200);
      expect(detail.body.data.jobType).toBe('workflow.webhook');
    });

    it('dashboard CRUD external system', async () => {
      const code = `sap_${Date.now()}`;
      const create = await request(app)
        .post('/api/v1/dashboard/integrations/systems')
        .set(bearer(dashToken))
        .send({
          code,
          name: 'SAP Test Connector',
          systemType: 'erp',
          baseUrl: 'https://sap.example.com',
          isActive: false,
        });

      expect(create.status).toBe(201);
      expect(create.body.data.code).toBe(code);
      const systemId = create.body.data.id as string;

      const patch = await request(app)
        .patch(`/api/v1/dashboard/integrations/systems/${systemId}`)
        .set(bearer(dashToken))
        .send({ name: 'SAP Test Connector Updated', isActive: true });

      expect(patch.status).toBe(200);
      expect(patch.body.data.name).toBe('SAP Test Connector Updated');
      expect(patch.body.data.isActive).toBe(true);

      const list = await request(app)
        .get('/api/v1/dashboard/integrations/systems')
        .set(bearer(dashToken));

      expect(list.status).toBe(200);
      expect(list.body.data.some((s: { id: string }) => s.id === systemId)).toBe(true);

      const mappings = await request(app)
        .get(`/api/v1/dashboard/integrations/systems/${systemId}/mappings`)
        .set(bearer(dashToken));

      expect(mappings.status).toBe(200);
      expect(Array.isArray(mappings.body.data)).toBe(true);
    });

    it('lists seeded odoo external system as inactive', async () => {
      const list = await request(app)
        .get('/api/v1/dashboard/integrations/systems')
        .set(bearer(dashToken));

      const odoo = list.body.data.find((s: { code: string }) => s.code === 'odoo');
      expect(odoo).toBeDefined();
      expect(odoo.isActive).toBe(false);
    });
  });

  describe('Phase 13 — Localization', () => {
    it('upserts category translation and resolves via localizationResolver', async () => {
      const arName = `وجبات-${Date.now()}`;

      const upsert = await request(app)
        .put('/api/v1/dashboard/translations')
        .set(bearer(dashToken))
        .send({
          translations: [
            {
              entityType: 'category',
              entityId: SEED_CATEGORY_ID,
              fieldName: 'name',
              languageCode: 'ar',
              translatedValue: arName,
            },
          ],
        });

      expect(upsert.status).toBe(200);
      expect(upsert.body.data[0].translatedValue).toBe(arName);

      const resolved = await resolveTranslation('category', SEED_CATEGORY_ID, 'name', 'ar');
      expect(resolved).toBe(arName);
    });

    it('company lists active languages', async () => {
      const res = await request(app)
        .get('/api/v1/company/languages')
        .set(bearer(companyToken));

      expect(res.status).toBe(200);
      expect(res.body.data.some((l: { code: string }) => l.code === 'en')).toBe(true);
      expect(res.body.data.some((l: { code: string }) => l.code === 'ar')).toBe(true);
    });

    it('getProduct returns translated name when lang query provided', async () => {
      const arProductName = `وجبة دجاج-${Date.now()}`;
      await request(app)
        .put('/api/v1/dashboard/catalog/products/' + SEED_PRODUCT_ID + '/translations/ar')
        .set(bearer(dashToken))
        .send({ name: arProductName, description: 'وصف الوجبة' });

      const product = await request(app)
        .get(`/api/v1/dashboard/catalog/products/${SEED_PRODUCT_ID}`)
        .set(bearer(dashToken))
        .query({ lang: 'ar' });

      expect(product.status).toBe(200);
      expect(product.body.data.name).toBe(arProductName);
    });
  });
});
