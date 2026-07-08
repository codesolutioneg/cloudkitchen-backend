import { faker } from '@faker-js/faker';
import fs from 'fs';
import path from 'path';

export interface E2eRunContext {
  runId: string;
  seed: number;
  companyPassword: string;
  legalName: string;
  tradeName: string;
  primaryContactName: string;
  companyEmail: string;
  userEmail: string;
  userFullName: string;
  primaryPhone: string;
  slugPrefix: string;
  productName: string;
  categoryName: string;
  menuName: string;
}

export function createE2eRunContext(): E2eRunContext {
  const runId = faker.string.alphanumeric(12).toLowerCase();
  const seed = faker.number.int({ min: 10_000, max: 9_999_999 });
  faker.seed(seed);

  const slugPrefix = `e2e-${runId}`;
  const domain = faker.internet.domainName();

  return {
    runId,
    seed,
    companyPassword: `E2e!${faker.internet.password({ length: 12 })}9`,
    legalName: faker.company.name(),
    tradeName: faker.company.catchPhrase(),
    primaryContactName: faker.person.fullName(),
    companyEmail: `${slugPrefix}-reg@${domain}`,
    userEmail: `${slugPrefix}-user@${domain}`,
    userFullName: faker.person.fullName(),
    primaryPhone: `+9665${faker.string.numeric(8)}`,
    slugPrefix,
    productName: faker.commerce.productName(),
    categoryName: faker.commerce.department(),
    menuName: `${faker.word.adjective()} ${faker.word.noun()} Menu`,
  };
}

export interface EndpointHit {
  method: string;
  path: string;
  status: number;
  at: string;
}

export interface E2eManifest {
  runId: string;
  seed: number;
  startedAt: string;
  finishedAt?: string;
  note: string;
  credentials: {
    companyUserEmail: string;
    companyPassword: string;
    dashboardEmail: string;
    dashboardPassword: string;
  };
  entities: Record<string, string | number | boolean | null>;
  endpointsHit: EndpointHit[];
}

export function createManifest(ctx: E2eRunContext, dashboardEmail: string, dashboardPassword: string): E2eManifest {
  return {
    runId: ctx.runId,
    seed: ctx.seed,
    startedAt: new Date().toISOString(),
    note: 'Persisted test data — inspect in Postgres; rows are intentionally not deleted.',
    credentials: {
      companyUserEmail: ctx.userEmail,
      companyPassword: ctx.companyPassword,
      dashboardEmail,
      dashboardPassword,
    },
    entities: {},
    endpointsHit: [],
  };
}

export function trackHit(
  manifest: E2eManifest,
  method: string,
  path: string,
  status: number,
): void {
  manifest.endpointsHit.push({
    method: method.toUpperCase(),
    path,
    status,
    at: new Date().toISOString(),
  });
}

export function writeE2eManifest(manifest: E2eManifest): string {
  const dir = path.resolve(__dirname, '../output');
  fs.mkdirSync(dir, { recursive: true });
  manifest.finishedAt = new Date().toISOString();

  const filename = `e2e-manifest-${manifest.runId}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(dir, 'latest-e2e-manifest.json'), JSON.stringify(manifest, null, 2));
  return filepath;
}

export function futureDeliveryIso(hoursFromNow = faker.number.int({ min: 24, max: 168 })): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}
