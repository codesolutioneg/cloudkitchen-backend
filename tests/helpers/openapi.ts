import { randomUUID } from 'crypto';
import '../../src/core/openapi/bootstrap';
import {
  buildApiUrl,
  generateOpenApiDocument,
  listOpenApiOperations,
  OPENAPI_SERVER_URL,
  type OpenApiOperation,
} from '../../src/core/openapi/document';

export { buildApiUrl, generateOpenApiDocument, listOpenApiOperations, OPENAPI_SERVER_URL };

export function fillOpenApiPathParams(path: string, overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    id: randomUUID(),
    companyId: randomUUID(),
    stepId: randomUUID(),
    eventId: randomUUID(),
    transitionId: randomUUID(),
    attachmentId: randomUUID(),
    fileId: randomUUID(),
    level: '1',
  };

  return path.replace(/\{([^}]+)\}/g, (_, param: string) => overrides[param] ?? defaults[param] ?? randomUUID());
}

export function isExpressRouteMissing(res: { status: number; body?: { error?: { message?: string } } }): boolean {
  return res.status === 404 && res.body?.error?.message === 'Route not found';
}

export function resolveAuthHeaders(
  operation: OpenApiOperation,
  tokens: { dashboard: string; company: string },
): Record<string, string> {
  if (operation.path.includes('/auth/')) {
    return {};
  }

  const security = operation.security;
  if (security?.some((entry) => entry.dashboardBearerAuth)) {
    return { Authorization: `Bearer ${tokens.dashboard}` };
  }
  if (security?.some((entry) => entry.companyBearerAuth)) {
    return { Authorization: `Bearer ${tokens.company}` };
  }

  if (operation.path.includes('/dashboard/')) {
    return { Authorization: `Bearer ${tokens.dashboard}` };
  }
  if (
    operation.path.includes('/company/') ||
    operation.path.includes('/me/') ||
    operation.path === '/api/v1/files' ||
    operation.path.startsWith('/api/v1/files/')
  ) {
    return { Authorization: `Bearer ${tokens.company}` };
  }

  return {};
}

export function minimalJsonBody(operation: OpenApiOperation): Record<string, unknown> | undefined {
  if (operation.method === 'get' || operation.method === 'delete') {
    return undefined;
  }

  const path = operation.path;

  if (path.endsWith('/auth/company/login') || path.endsWith('/auth/dashboard/login')) {
    return { email: 'missing-user@example.com', password: 'WrongPass1!' };
  }
  if (path.includes('/otp/send')) {
    return { email: 'missing-user@example.com' };
  }
  if (path.includes('/otp/verify')) {
    return { email: 'missing-user@example.com', code: '000000' };
  }
  if (path.includes('/refresh')) {
    return { refreshToken: 'invalid-refresh-token' };
  }
  if (path.includes('/onboarding/register')) {
    return {};
  }

  return {};
}

export function loadRegisteredOpenApiOperations() {
  const doc = generateOpenApiDocument({
    title: 'Test',
    description: 'OpenAPI route coverage',
  });

  return {
    doc,
    operations: listOpenApiOperations(doc),
  };
}
