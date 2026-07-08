/**
 * Full software lifecycle E2E — random faker data per run, no DB cleanup.
 * Manifest written to tests/output/e2e-manifest-{runId}.json for inspection.
 */
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { faker } from '@faker-js/faker';
import app from '../../src/app';
import { prisma } from '../../src/prisma/client';
import {
  bearer,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
} from '../helpers/auth';
import {
  createE2eRunContext,
  createManifest,
  trackHit,
  writeE2eManifest,
  futureDeliveryIso,
} from '../helpers/dataGenerator';
import {
  buildApiUrl,
  fillOpenApiPathParams,
  isExpressRouteMissing,
  loadRegisteredOpenApiOperations,
  minimalJsonBody,
  OPENAPI_SERVER_URL,
  resolveAuthHeaders,
} from '../helpers/openapi';
import { notificationEngine } from '../../src/engines/notificationEngine';

const ctx = createE2eRunContext();
const manifest = createManifest(ctx, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);

const state: {
  dashToken: string;
  companyToken: string;
  companyId: string;
  companyUserId: string;
  categoryId: string;
  productId: string;
  pricingListId: string;
  menuId: string;
  sectionId: string;
  orderId: string;
  workflowId: string;
  ruleTypeId: string;
  businessRuleId: string;
  calendarId: string;
  calendarEventId: string;
  integrationSystemId: string;
  notificationTemplateCode: string;
  jobId: string;
  fileId: string;
} = {
  dashToken: '',
  companyToken: '',
  companyId: '',
  companyUserId: '',
  categoryId: '',
  productId: '',
  pricingListId: '',
  menuId: '',
  sectionId: '',
  orderId: '',
  workflowId: '',
  ruleTypeId: '',
  businessRuleId: '',
  calendarId: '',
  calendarEventId: '',
  integrationSystemId: '',
  notificationTemplateCode: '',
  jobId: '',
  fileId: '',
};

async function hit(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  token: string,
  body?: Record<string, unknown>,
  query?: Record<string, string | number>,
) {
  let agent = request(app)[method](path).set(bearer(token));
  if (query) agent = agent.query(query);
  if (body !== undefined) agent = agent.send(body);
  const res = await agent;
  trackHit(manifest, method, path, res.status);
  return res;
}

describe.sequential('Phase 14 — full lifecycle E2E (persisted data)', () => {
  afterAll(() => {
    const filepath = writeE2eManifest(manifest);
    // eslint-disable-next-line no-console
    console.log(`E2E manifest written: ${filepath}`);
  });

  it('01 — health check', async () => {
    const res = await request(app).get('/api/v1/health');
    trackHit(manifest, 'get', '/api/v1/health', res.status);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('02 — dashboard login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/dashboard/login')
      .send({ email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD });
    trackHit(manifest, 'post', '/api/v1/auth/dashboard/login', res.status);
    expect(res.status).toBe(200);
    state.dashToken = res.body.data.accessToken as string;
    manifest.entities.dashboardUserId = res.body.data.user?.id ?? null;
  });

  it('03 — company self-registration (faker)', async () => {
    const res = await request(app)
      .post('/api/v1/company/onboarding/register')
      .send({
        legalName: ctx.legalName,
        tradeName: ctx.tradeName,
        countryCode: 'SA',
        primaryContactName: ctx.primaryContactName,
        primaryEmail: ctx.companyEmail,
        primaryPhone: ctx.primaryPhone,
        userFullName: ctx.userFullName,
        userEmail: ctx.userEmail,
        password: ctx.companyPassword,
      });
    trackHit(manifest, 'post', '/api/v1/company/onboarding/register', res.status);
    expect(res.status).toBe(201);
    state.companyId = res.body.data.companyId as string;
    manifest.entities.companyId = state.companyId;
    manifest.entities.legalName = ctx.legalName;
  });

  it('04 — dashboard approves company', async () => {
    const res = await hit(
      'post',
      `/api/v1/dashboard/companies/${state.companyId}/approve`,
      state.dashToken,
      { reason: `E2E approval ${ctx.runId}` },
    );
    expect(res.status).toBe(200);
    manifest.entities.approvalStatus = 'approved';
  });

  it('05 — catalog: category + product + pricing', async () => {
    const category = await hit('post', '/api/v1/dashboard/catalog/categories', state.dashToken, {
      name: `${ctx.categoryName} ${ctx.runId}`,
      slug: `${ctx.slugPrefix}-cat`,
      sortOrder: faker.number.int({ min: 1, max: 20 }),
    });
    expect(category.status).toBe(201);
    state.categoryId = category.body.data.id as string;
    manifest.entities.categoryId = state.categoryId;

    const unitPrice = faker.number.float({ min: 10, max: 120, fractionDigits: 2 }).toFixed(2);

    const product = await hit('post', '/api/v1/dashboard/catalog/products', state.dashToken, {
      categoryId: state.categoryId,
      sku: `${ctx.slugPrefix}-sku`,
      name: `${ctx.productName} ${ctx.runId}`,
      basePrice: unitPrice,
      currency: 'SAR',
      visibility: 'public',
      description: faker.commerce.productDescription(),
    });
    expect(product.status).toBe(201);
    state.productId = product.body.data.id as string;
    manifest.entities.productId = state.productId;

    const translation = await hit(
      'put',
      `/api/v1/dashboard/catalog/products/${state.productId}/translations/ar`,
      state.dashToken,
      { name: faker.lorem.words(3), description: faker.lorem.sentence() },
    );
    expect(translation.status).toBe(200);

    const pricingList = await hit('post', '/api/v1/dashboard/catalog/pricing-lists', state.dashToken, {
      name: `E2E Pricing ${ctx.runId}`,
      currency: 'SAR',
      isDefault: false,
    });
    expect(pricingList.status).toBe(201);
    state.pricingListId = pricingList.body.data.id as string;
    manifest.entities.pricingListId = state.pricingListId;

    const price = await hit('post', '/api/v1/dashboard/catalog/prices', state.dashToken, {
      pricingListId: state.pricingListId,
      productId: state.productId,
      price: unitPrice,
    });
    expect(price.status).toBe(201);

    const assignment = await hit('post', '/api/v1/dashboard/catalog/company-assignment', state.dashToken, {
      companyId: state.companyId,
      pricingListId: state.pricingListId,
    });
    expect(assignment.status).toBe(201);
  });

  it('06 — menu: create, section, product, assign to company', async () => {
    const menu = await hit('post', '/api/v1/dashboard/menus', state.dashToken, {
      name: `${ctx.menuName} ${ctx.runId}`,
      menuType: 'general',
    });
    expect(menu.status).toBe(201);
    state.menuId = menu.body.data.id as string;
    manifest.entities.menuId = state.menuId;

    const section = await hit(
      'post',
      `/api/v1/dashboard/menus/${state.menuId}/sections`,
      state.dashToken,
      { name: faker.commerce.productAdjective(), sortOrder: 0 },
    );
    expect(section.status).toBe(201);
    state.sectionId = section.body.data.id as string;

    const attach = await hit(
      'post',
      `/api/v1/dashboard/menus/${state.menuId}/sections/${state.sectionId}/products`,
      state.dashToken,
      { productId: state.productId, sortOrder: 0 },
    );
    expect(attach.status).toBe(201);

    const menuAssign = await hit(
      'post',
      `/api/v1/dashboard/menus/${state.menuId}/assignments`,
      state.dashToken,
      { scopeType: 'company', scopeId: state.companyId, priority: 10 },
    );
    expect(menuAssign.status).toBe(201);
  });

  it('07 — company login + me + catalog browse', async () => {
    const login = await request(app)
      .post('/api/v1/auth/company/login')
      .send({ email: ctx.userEmail, password: ctx.companyPassword });
    trackHit(manifest, 'post', '/api/v1/auth/company/login', login.status);
    expect(login.status).toBe(200);
    state.companyToken = login.body.data.accessToken as string;

    const user = await prisma.companyUser.findFirst({ where: { email: ctx.userEmail } });
    state.companyUserId = user!.id;
    manifest.entities.companyUserId = state.companyUserId;

    const modules = await hit('get', '/api/v1/me/modules', state.companyToken);
    expect(modules.status).toBe(200);

    const settings = await hit('get', '/api/v1/company/settings', state.companyToken);
    expect(settings.status).toBe(200);

    const menuBrowse = await hit('get', '/api/v1/company/catalog/menu', state.companyToken);
    expect(menuBrowse.status).toBe(200);
    expect(menuBrowse.body.data.sections.length).toBeGreaterThan(0);
  });

  it('08 — place order and dashboard workflow transition', async () => {
    const create = await hit('post', '/api/v1/company/orders', state.companyToken, {
      items: [{ productId: state.productId, quantity: faker.number.int({ min: 1, max: 5 }) }],
      requestedDeliveryAt: futureDeliveryIso(),
      fulfillmentType: faker.helpers.arrayElement(['pickup', 'delivery'] as const),
      sourceChannel: 'e2e',
    });
    expect(create.status).toBe(201);
    state.orderId = create.body.data.id as string;
    manifest.entities.orderId = state.orderId;
    manifest.entities.orderNumber = create.body.data.orderNumber as string;

    const list = await hit('get', '/api/v1/company/orders', state.companyToken);
    expect(list.status).toBe(200);

    const detail = await hit('get', `/api/v1/company/orders/${state.orderId}`, state.companyToken);
    expect(detail.status).toBe(200);

    const workflows = await hit('get', '/api/v1/dashboard/workflows', state.dashToken, undefined, {
      workflowType: 'order',
    });
    expect(workflows.status).toBe(200);
    state.workflowId = workflows.body.data[0].id as string;

    const steps = await hit(
      'get',
      `/api/v1/dashboard/workflows/${state.workflowId}/steps`,
      state.dashToken,
    );
    const pendingStep = steps.body.data.find((s: { code: string }) => s.code === 'pending_approval');
    expect(pendingStep).toBeDefined();

    const transition = await hit(
      'post',
      `/api/v1/dashboard/orders/${state.orderId}/transitions`,
      state.dashToken,
      { toStepId: pendingStep.id, comment: `E2E review ${ctx.runId}` },
    );
    expect(transition.status).toBe(200);

    const note = await hit(
      'post',
      `/api/v1/dashboard/orders/${state.orderId}/notes`,
      state.dashToken,
      { note: faker.lorem.sentence(), isInternal: true },
    );
    expect(note.status).toBe(201);

    const tracking = await hit(
      'get',
      `/api/v1/company/orders/${state.orderId}/tracking`,
      state.companyToken,
    );
    expect(tracking.status).toBe(200);
  });

  it('09 — business rules + calendars', async () => {
    const ruleTypeCode = `${ctx.slugPrefix}_moq`;
    const ruleType = await hit('post', '/api/v1/dashboard/rules/rule-types', state.dashToken, {
      code: ruleTypeCode,
      name: `MOQ ${ctx.runId}`,
      valueSchema: { type: 'number' },
    });
    expect(ruleType.status).toBe(201);
    state.ruleTypeId = ruleType.body.data.id as string;

    const rule = await hit('post', '/api/v1/dashboard/rules/business-rules', state.dashToken, {
      ruleTypeId: state.ruleTypeId,
      scopeType: 'company',
      scopeId: state.companyId,
      value: { minQty: faker.number.int({ min: 1, max: 20 }) },
      priority: 5,
    });
    expect(rule.status).toBe(201);
    state.businessRuleId = rule.body.data.id as string;
    manifest.entities.businessRuleId = state.businessRuleId;

    const resolved = await hit(
      'get',
      '/api/v1/dashboard/rules/business-rules/resolve',
      state.dashToken,
      undefined,
      { ruleTypeCode, companyId: state.companyId },
    );
    expect(resolved.status).toBe(200);

    const calendar = await hit('post', '/api/v1/dashboard/rules/calendars', state.dashToken, {
      name: `E2E Calendar ${ctx.runId}`,
      countryCode: 'SA',
    });
    expect(calendar.status).toBe(201);
    state.calendarId = calendar.body.data.id as string;

    const event = await hit(
      'post',
      `/api/v1/dashboard/rules/calendars/${state.calendarId}/events`,
      state.dashToken,
      {
        eventDate: faker.date.future().toISOString().slice(0, 10),
        eventType: 'blackout',
        name: faker.lorem.words(2),
      },
    );
    expect(event.status).toBe(201);
    state.calendarEventId = event.body.data.id as string;
  });

  it('10 — notifications, jobs, integrations, localization', async () => {
    const device = await hit('post', '/api/v1/company/device-tokens', state.companyToken, {
      platform: 'android',
      token: `fcm-e2e-${ctx.runId}`,
    });
    expect(device.status).toBe(201);

    state.notificationTemplateCode = `e2e_alert_${ctx.runId}`;
    const template = await hit('post', '/api/v1/dashboard/notification-templates', state.dashToken, {
      code: state.notificationTemplateCode,
      channel: 'in_app',
      bodyTemplate: 'E2E: {{message}}',
      subjectTemplate: 'E2E Alert',
      languageCode: 'en',
    });
    expect(template.status).toBe(201);

    await notificationEngine.queueNotification({
      templateCode: state.notificationTemplateCode,
      channels: ['in_app'],
      recipientType: 'company_user',
      recipientId: state.companyUserId,
      recipientCompanyId: state.companyId,
      languageCode: 'en',
      variables: { message: faker.lorem.sentence() },
    });

    const notifications = await hit('get', '/api/v1/company/notifications', state.companyToken);
    expect(notifications.status).toBe(200);
    expect(notifications.body.data.length).toBeGreaterThan(0);

    const { enqueueJob } = await import('../../src/jobs/jobQueue');
    state.jobId = await enqueueJob({
      jobType: 'workflow.webhook',
      payload: { runId: ctx.runId, entityType: 'order', entityId: state.orderId },
      queueName: 'workflow',
    });
    manifest.entities.jobId = state.jobId;

    const jobs = await hit('get', '/api/v1/dashboard/jobs', state.dashToken, undefined, {
      jobType: 'workflow.webhook',
    });
    expect(jobs.status).toBe(200);

    const integrationCode = `erp_${ctx.runId}`;
    const system = await hit('post', '/api/v1/dashboard/integrations/systems', state.dashToken, {
      code: integrationCode,
      name: faker.company.name(),
      systemType: 'erp',
      baseUrl: faker.internet.url(),
      isActive: false,
    });
    expect(system.status).toBe(201);
    state.integrationSystemId = system.body.data.id as string;

    const langUpsert = await hit('put', '/api/v1/dashboard/translations', state.dashToken, {
      translations: [
        {
          entityType: 'category',
          entityId: state.categoryId,
          fieldName: 'name',
          languageCode: 'ar',
          translatedValue: faker.lorem.words(2),
        },
      ],
    });
    expect(langUpsert.status).toBe(200);

    const langs = await hit('get', '/api/v1/company/languages', state.companyToken);
    expect(langs.status).toBe(200);
  });

  it('11 — audit, files, dashboard navigation, RBAC list', async () => {
    const audit = await hit('get', '/api/v1/dashboard/audit-logs', state.dashToken, undefined, {
      entityType: 'order',
      entityId: state.orderId,
      page: 1,
      pageSize: 20,
    });
    expect(audit.status).toBe(200);

    const upload = await request(app)
      .post('/api/v1/files')
      .set(bearer(state.companyToken))
      .attach('file', Buffer.from('%PDF-1.4 e2e upload'), {
        filename: `${ctx.slugPrefix}.pdf`,
        contentType: 'application/pdf',
      })
      .field('entityType', 'company')
      .field('entityId', state.companyId)
      .field('attachmentType', 'other');
    trackHit(manifest, 'post', '/api/v1/files', upload.status);
    expect(upload.status).toBe(201);
    state.fileId = upload.body.data.id as string;
    manifest.entities.fileId = state.fileId;

    const nav = await hit('get', '/api/v1/me/navigation', state.dashToken);
    expect(nav.status).toBe(200);

    const permissions = await hit('get', '/api/v1/dashboard/permissions', state.dashToken);
    expect(permissions.status).toBe(200);

    const companies = await hit('get', '/api/v1/dashboard/companies', state.dashToken);
    expect(companies.status).toBe(200);
    expect(
      companies.body.data.some((c: { id: string }) => c.id === state.companyId),
    ).toBe(true);
  });

  it('12 — sweeps all OpenAPI operations (no 404 Route not found)', async () => {
    const { operations } = loadRegisteredOpenApiOperations();
    const paramOverrides: Record<string, string> = {
      id: state.productId,
      companyId: state.companyId,
      menuId: state.menuId,
      sectionId: state.sectionId,
      productId: state.productId,
      orderId: state.orderId,
      eventId: state.calendarEventId,
      fileId: state.fileId,
      assignmentId: state.menuId,
      variantId: state.productId,
      groupId: state.productId,
      availabilityId: state.productId,
      tagId: state.productId,
      stepId: state.workflowId,
      transitionId: state.workflowId,
      roleId: '00000000-0000-4000-8000-000000000001',
      lang: 'ar',
    };

    const missingRoutes: string[] = [];

    for (const operation of operations) {
      const url = fillOpenApiPathParams(buildApiUrl(operation.path, OPENAPI_SERVER_URL), paramOverrides);
      const headers = resolveAuthHeaders(operation, {
        dashboard: state.dashToken,
        company: state.companyToken,
      });

      let agent = request(app)[operation.method](url).set(headers);

      if (operation.hasMultipartBody) {
        if (operation.path.includes('/onboarding/documents')) {
          agent = agent
            .attach('file', Buffer.from('%PDF-1.4 e2e'), 'license.pdf')
            .field('attachmentType', 'trade_license');
        } else {
          agent = agent
            .attach('file', Buffer.from('e2e-bytes'), 'upload.txt')
            .field('entityType', 'company')
            .field('entityId', state.companyId)
            .field('attachmentType', 'other');
        }
      } else {
        const body = minimalJsonBody(operation);
        if (body !== undefined) agent = agent.send(body);
      }

      const res = await agent;
      trackHit(manifest, operation.method, operation.path, res.status);

      if (isExpressRouteMissing(res)) {
        missingRoutes.push(`${operation.method.toUpperCase()} ${operation.path}`);
      }
    }

    manifest.entities.openapiOperationsSwept = operations.length;
    expect(
      missingRoutes,
      `OpenAPI operations with no Express handler:\n${missingRoutes.join('\n')}`,
    ).toHaveLength(0);
  }, 120_000);
});
