import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import './bootstrap';
import { generateOpenApiDocument } from './document';

const API_DOCS_NOTICE = `
## Audience & authentication

This document lists **all** Cloud Kitchen B2B API operations.

| Path prefix | Token required |
|-------------|----------------|
| \`/api/v1/company/*\`, \`/api/v1/me/*\`, company auth | **Company** Bearer JWT |
| \`/api/v1/dashboard/*\`, dashboard auth | **Dashboard** Bearer JWT |
| \`/api/v1/health\` | None |
| \`/api/v1/files/*\` | Company **or** Dashboard JWT |

Calling a dashboard endpoint with a company token (or vice versa) returns **401 Unauthorized**.
`;

export function setupOpenApi(app: Express): void {
  const apiDoc = generateOpenApiDocument({
    title: 'Cloud Kitchen B2B — API Reference',
    description: API_DOCS_NOTICE.trim(),
  });

  app.use('/api/docs', swaggerUi.serveFiles(apiDoc), swaggerUi.setup(apiDoc));

  app.get('/api/docs/company', (_req, res) => {
    res.redirect(301, '/api/docs');
  });
  app.get('/api/docs/dashboard', (_req, res) => {
    res.redirect(301, '/api/docs');
  });
}
