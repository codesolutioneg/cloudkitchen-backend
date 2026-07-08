import { prisma } from '../prisma/client';
import { cacheDeleteByPrefix, cacheGet, cacheSet } from '../core/utils/cache';

const COMPANY_MODULES_CACHE_TTL_MS = 60_000;

export type ModuleFeatureContext =
  | { audience: 'company'; companyId: string }
  | { audience: 'dashboard'; dashboardUserId: string };

function isWithinWindow(
  atInstant: Date,
  enabledFrom: Date | null,
  enabledUntil: Date | null,
): boolean {
  if (enabledFrom && atInstant < enabledFrom) {
    return false;
  }
  if (enabledUntil && atInstant >= enabledUntil) {
    return false;
  }
  return true;
}

async function loadDashboardUserRoleIds(dashboardUserId: string): Promise<string[]> {
  const rows = await prisma.dashboardUserRole.findMany({
    where: { dashboard_user_id: dashboardUserId },
    select: { role_id: true },
  });
  return rows.map((r) => r.role_id);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveModuleId(moduleCodeOrId: string): Promise<string | null> {
  if (UUID_RE.test(moduleCodeOrId)) {
    const byId = await prisma.module.findUnique({ where: { id: moduleCodeOrId } });
    if (byId) {
      return byId.id;
    }
  }
  const byCode = await prisma.module.findUnique({ where: { code: moduleCodeOrId } });
  return byCode?.id ?? null;
}

async function resolveFeatureId(featureCodeOrId: string): Promise<string | null> {
  if (UUID_RE.test(featureCodeOrId)) {
    const byId = await prisma.feature.findUnique({ where: { id: featureCodeOrId } });
    if (byId) {
      return byId.id;
    }
  }
  const byCode = await prisma.feature.findUnique({ where: { code: featureCodeOrId } });
  return byCode?.id ?? null;
}

async function isCompanyModuleEnabled(
  companyId: string,
  moduleId: string,
  atInstant: Date,
): Promise<boolean> {
  const mod = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!mod || mod.audience !== 'company') {
    return false;
  }

  const assignment = await prisma.companyModule.findUnique({
    where: { company_id_module_id: { company_id: companyId, module_id: moduleId } },
  });

  if (assignment) {
    if (!assignment.is_enabled) {
      return false;
    }
    return isWithinWindow(atInstant, assignment.enabled_from, assignment.enabled_until);
  }

  return mod.is_core;
}

async function isDashboardModuleEnabled(
  dashboardUserId: string,
  moduleId: string,
): Promise<boolean> {
  const mod = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!mod || mod.audience !== 'dashboard') {
    return false;
  }

  const roleIds = await loadDashboardUserRoleIds(dashboardUserId);
  if (roleIds.length === 0) {
    return mod.is_core;
  }

  const roleModules = await prisma.dashboardRoleModule.findMany({
    where: { module_id: moduleId, role_id: { in: roleIds } },
  });

  if (roleModules.some((rm) => rm.is_enabled)) {
    return true;
  }

  return mod.is_core && roleModules.length === 0;
}

async function isCompanyFeatureEnabled(
  companyId: string,
  featureId: string,
  atInstant: Date,
): Promise<boolean> {
  const feature = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!feature) {
    return false;
  }

  if (feature.module_id) {
    const moduleEnabled = await isCompanyModuleEnabled(companyId, feature.module_id, atInstant);
    if (!moduleEnabled) {
      return false;
    }
  }

  const assignment = await prisma.companyFeature.findUnique({
    where: { company_id_feature_id: { company_id: companyId, feature_id: featureId } },
  });

  if (assignment) {
    if (!assignment.is_enabled) {
      return false;
    }
    return isWithinWindow(atInstant, assignment.enabled_from, assignment.enabled_until);
  }

  return feature.is_global_default_enabled;
}

async function isDashboardFeatureEnabled(
  dashboardUserId: string,
  featureId: string,
): Promise<boolean> {
  const feature = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!feature) {
    return false;
  }

  if (feature.module_id) {
    const moduleEnabled = await isDashboardModuleEnabled(dashboardUserId, feature.module_id);
    if (!moduleEnabled) {
      return false;
    }
  }

  const roleIds = await loadDashboardUserRoleIds(dashboardUserId);
  if (roleIds.length === 0) {
    return feature.is_global_default_enabled;
  }

  const roleFeatures = await prisma.dashboardRoleFeature.findMany({
    where: { feature_id: featureId, role_id: { in: roleIds } },
  });

  if (roleFeatures.some((rf) => rf.is_enabled)) {
    return true;
  }

  if (roleFeatures.length > 0) {
    return false;
  }

  return feature.is_global_default_enabled;
}

/** Module OFF always wins over feature-level flags (§12). */
export async function isModuleEnabled(
  context: ModuleFeatureContext,
  moduleCodeOrId: string,
  atInstant = new Date(),
): Promise<boolean> {
  const moduleId = await resolveModuleId(moduleCodeOrId);
  if (!moduleId) {
    return false;
  }

  if (context.audience === 'company') {
    return isCompanyModuleEnabled(context.companyId, moduleId, atInstant);
  }

  return isDashboardModuleEnabled(context.dashboardUserId, moduleId);
}

/** Respects parent module gate — module-off-always-wins (§12). */
export async function isFeatureEnabled(
  context: ModuleFeatureContext,
  featureCodeOrId: string,
  atInstant = new Date(),
): Promise<boolean> {
  const featureId = await resolveFeatureId(featureCodeOrId);
  if (!featureId) {
    return false;
  }

  if (context.audience === 'company') {
    return isCompanyFeatureEnabled(context.companyId, featureId, atInstant);
  }

  return isDashboardFeatureEnabled(context.dashboardUserId, featureId);
}

/** Flat `{ featureCode: boolean }` map for a company (§8.9, §12). */
export async function resolveCompanyModules(
  companyId: string,
  atInstant = new Date(),
): Promise<Record<string, boolean>> {
  const cacheKey = `company-modules:${companyId}`;
  const cached = await cacheGet<Record<string, boolean>>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const features = await prisma.feature.findMany({
    include: { module: true },
    orderBy: { code: 'asc' },
  });

  const companyFeatures = features.filter((f) => !f.module || f.module.audience === 'company');
  const result: Record<string, boolean> = {};

  for (const feature of companyFeatures) {
    result[feature.code] = await isCompanyFeatureEnabled(companyId, feature.id, atInstant);
  }

  await cacheSet(cacheKey, result, COMPANY_MODULES_CACHE_TTL_MS);
  return result;
}

export async function invalidateCompanyModulesCache(companyId: string): Promise<void> {
  await cacheDeleteByPrefix(`company-modules:${companyId}`);
}

export const moduleFeatureResolver = {
  isModuleEnabled,
  isFeatureEnabled,
  resolveCompanyModules,
  invalidateCompanyModulesCache,
};
