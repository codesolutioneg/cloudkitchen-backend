import { describe, it, expect } from 'vitest';
import { loadRegisteredOpenApiOperations } from '../helpers/openapi';
import { discoverExpressRoutes, routeKey, toOpenApiPath } from '../helpers/expressRoutes';

describe('OpenAPI coverage gate (§21.6)', () => {
  const expressRoutes = discoverExpressRoutes();
  const { operations } = loadRegisteredOpenApiOperations();

  const openApiKeys = new Set(
    operations.map((op) => routeKey(op.method, op.path)),
  );

  const missing = expressRoutes.filter(
    (route) => !openApiKeys.has(routeKey(route.method, toOpenApiPath(route.path))),
  );

  it('discovers every Express route module', () => {
    expect(expressRoutes.length).toBeGreaterThan(150);
    const modules = new Set(expressRoutes.map((r) => r.module));
    expect(modules.has('auth')).toBe(true);
    expect(modules.has('orders')).toBe(true);
    expect(modules.has('catalog')).toBe(true);
  });

  it('every Express route has a matching OpenAPI operation', () => {
    if (missing.length > 0) {
      const report = missing
        .map((r) => `${r.method.toUpperCase()} ${toOpenApiPath(r.path)} (${r.sourceFile})`)
        .join('\n');
      expect.fail(`Missing OpenAPI entries for ${missing.length} route(s):\n${report}`);
    }
    expect(missing).toHaveLength(0);
  });

  it('OpenAPI operation count matches or exceeds Express route count', () => {
    expect(operations.length).toBeGreaterThanOrEqual(expressRoutes.length);
  });
});
