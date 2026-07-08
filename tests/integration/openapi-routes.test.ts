import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import {
  loginCompanyUser,
  loginDashboardUser,
  registerCompany,
} from '../helpers/auth';
import {
  buildApiUrl,
  fillOpenApiPathParams,
  isExpressRouteMissing,
  loadRegisteredOpenApiOperations,
  minimalJsonBody,
  OPENAPI_SERVER_URL,
  resolveAuthHeaders,
  type OpenApiOperation,
} from '../helpers/openapi';

describe('OpenAPI route coverage', () => {
  const { doc, operations } = loadRegisteredOpenApiOperations();
  const serverUrl = doc.servers?.[0]?.url ?? OPENAPI_SERVER_URL;

  let dashboardToken = '';
  let companyToken = '';
  let companyId = '';

  beforeAll(async () => {
    const suffix = Date.now();
    const dash = await loginDashboardUser();
    dashboardToken = dash.body.data.accessToken as string;

    const reg = await registerCompany(`openapi-${suffix}`);
    companyId = reg.body.data.companyId as string;
    const company = await loginCompanyUser(`user-openapi-${suffix}@example.com`, 'SecurePass123!');
    companyToken = company.body.data.accessToken as string;
  });

  it('health path resolves without /api/api duplication', () => {
    const healthPath = '/api/v1/health';
    expect(buildApiUrl(healthPath, serverUrl)).toBe('/api/v1/health');
  });

  it('GET /api/v1/health matches Swagger documented path', async () => {
    const res = await request(app).get(buildApiUrl('/api/v1/health', serverUrl));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  async function invokeOperation(operation: OpenApiOperation) {
    const url = fillOpenApiPathParams(buildApiUrl(operation.path, serverUrl), {
      companyId,
    });
    const headers = resolveAuthHeaders(operation, {
      dashboard: dashboardToken,
      company: companyToken,
    });

    const agent = request(app)[operation.method](url).set(headers);

    if (operation.hasMultipartBody) {
      if (operation.path.includes('/onboarding/documents')) {
        return agent
          .attach('file', Buffer.from('%PDF-1.4'), 'license.pdf')
          .field('attachmentType', 'trade_license');
      }

      return agent
        .attach('file', Buffer.from('file-bytes'), 'upload.txt')
        .field('entityType', 'company')
        .field('entityId', companyId)
        .field('attachmentType', 'other');
    }

    const body = minimalJsonBody(operation);
    if (body !== undefined) {
      return agent.send(body);
    }

    return agent;
  }

  it.each(operations.map((op) => [op.method.toUpperCase(), op.path, op] as const))(
    '%s %s is registered in Express (not Route not found)',
    async (_method, _path, operation) => {
      const res = await invokeOperation(operation);

      expect(
        isExpressRouteMissing(res),
        `Expected a real route handler but got 404 Route not found for ${operation.method.toUpperCase()} ${operation.path}`,
      ).toBe(false);
    },
    30_000,
  );

  it('covers every OpenAPI path at least once', () => {
    const uniquePaths = new Set(operations.map((op) => op.path));
    expect(uniquePaths.size).toBeGreaterThan(40);
    expect(uniquePaths.has('/api/v1/health')).toBe(true);
    expect(uniquePaths.has('/api/v1/dashboard/workflows')).toBe(true);
    expect(uniquePaths.has('/api/v1/company/settings')).toBe(true);
  });
});
