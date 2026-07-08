import { describe, it, expect } from 'vitest';
import {
  buildApiUrl,
  generateOpenApiDocument,
  listOpenApiOperations,
  OPENAPI_SERVER_URL,
} from '../../src/core/openapi/document';
import app from '../../src/app';

// Import app so all schema modules register their OpenAPI paths.
void app;

describe('OpenAPI document', () => {
  it('does not duplicate /api when combining server URL with paths', () => {
    const doc = generateOpenApiDocument({ title: 't', description: 'd' });
    const serverUrl = doc.servers?.[0]?.url ?? OPENAPI_SERVER_URL;

    for (const path of Object.keys(doc.paths ?? {})) {
      const url = buildApiUrl(path, serverUrl);
      expect(url).not.toMatch(/\/api\/api\//);
      expect(url).toMatch(/^\/api\/v1\//);
    }
  });

  it('lists every registered operation with a method and path', () => {
    const doc = generateOpenApiDocument({ title: 't', description: 'd' });
    const operations = listOpenApiOperations(doc);

    expect(operations.length).toBeGreaterThan(50);
    expect(operations.some((op) => op.path === '/api/v1/health' && op.method === 'get')).toBe(true);
  });
});
