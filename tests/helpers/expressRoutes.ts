import fs from 'fs';
import path from 'path';

export interface ExpressRoute {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  module: string;
  sourceFile: string;
}

const ROUTE_METHOD_RE =
  /router\.(get|post|put|patch|delete)\(\s*(?:\n\s*)?['"`]([^'"`]+)['"`]/g;

function walkRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkRouteFiles(full));
    } else if (entry.name.endsWith('.routes.ts')) {
      files.push(full);
    }
  }

  return files;
}

/** Normalize Express `:param` segments to OpenAPI `{param}` form. */
export function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([a-zA-Z][a-zA-Z0-9]*)/g, '{$1}');
}

export function routeKey(method: string, openApiPath: string): string {
  return `${method.toLowerCase()} ${openApiPath}`;
}

export function discoverExpressRoutes(): ExpressRoute[] {
  const modulesRoot = path.resolve(__dirname, '../../src/modules');
  const files = walkRouteFiles(modulesRoot);
  const routes: ExpressRoute[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(path.resolve(__dirname, '../..'), file);
    const module = rel.split(path.sep)[2] ?? 'unknown';

    let match: RegExpExecArray | null;
    ROUTE_METHOD_RE.lastIndex = 0;
    while ((match = ROUTE_METHOD_RE.exec(content)) !== null) {
      const method = match[1] as ExpressRoute['method'];
      const routePath = match[2].startsWith('/') ? match[2] : `/${match[2]}`;
      routes.push({
        method,
        path: `/api/v1${routePath}`,
        module,
        sourceFile: rel,
      });
    }
  }

  return routes.sort((a, b) => routeKey(a.method, a.path).localeCompare(routeKey(b.method, b.path)));
}
