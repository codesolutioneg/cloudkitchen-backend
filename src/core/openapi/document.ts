import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';

/** Relative server root — OpenAPI paths already include `/api/v1/...`. */
export const OPENAPI_SERVER_URL = '/';

export type OpenApiDocument = ReturnType<typeof generateOpenApiDocument>;

export function generateOpenApiDocument(info: {
  title: string;
  description: string;
}): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: info.title,
      version: '1.0.0',
      description: info.description,
    },
    servers: [{ url: OPENAPI_SERVER_URL, description: 'API root' }],
  });
}

/** Combine OpenAPI server URL + path without duplicating segments like `/api/api/`. */
export function buildApiUrl(
  openApiPath: string,
  serverUrl: string = OPENAPI_SERVER_URL,
): string {
  if (!serverUrl || serverUrl === '/') {
    return openApiPath;
  }

  const base = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
  if (openApiPath.startsWith(base)) {
    return openApiPath;
  }

  return `${base}${openApiPath}`;
}

export type OpenApiOperation = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  hasMultipartBody: boolean;
};

export function listOpenApiOperations(doc: OpenApiDocument): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];

  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue;

    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = pathItem[method];
      if (!operation) continue;

      const requestBody = operation.requestBody as
        | { content?: Record<string, unknown> }
        | undefined;
      const hasMultipartBody = Boolean(requestBody?.content?.['multipart/form-data']);

      operations.push({
        method,
        path,
        operationId: operation.operationId,
        security: operation.security as Array<Record<string, string[]>> | undefined,
        hasMultipartBody,
      });
    }
  }

  return operations;
}
