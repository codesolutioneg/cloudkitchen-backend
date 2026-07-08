import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { ConflictError, NotFoundError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';
import { moduleFeatureResolver } from '../../engines/moduleFeatureResolver';
import { permissionResolver } from '../../engines/permissionResolver';

function serializeFeature(feature: {
  id: string;
  code: string;
  name: string;
  feature_group_id: string | null;
  module_id: string | null;
  description: string | null;
  is_global_default_enabled: boolean;
  requires_permission_id: string | null;
}) {
  return {
    id: feature.id,
    code: feature.code,
    name: feature.name,
    featureGroupId: feature.feature_group_id,
    moduleId: feature.module_id,
    description: feature.description,
    isGlobalDefaultEnabled: feature.is_global_default_enabled,
    requiresPermissionId: feature.requires_permission_id,
  };
}

function serializeFeatureGroup(group: {
  id: string;
  name: string;
  sort_order: number;
}) {
  return {
    id: group.id,
    name: group.name,
    sortOrder: group.sort_order,
  };
}

function serializeModule(mod: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_core: boolean;
  sort_order: number;
  audience: string;
}) {
  return {
    id: mod.id,
    code: mod.code,
    name: mod.name,
    description: mod.description,
    isCore: mod.is_core,
    sortOrder: mod.sort_order,
    audience: mod.audience,
  };
}

function serializeFeatureFlag(flag: {
  id: string;
  key: string;
  description: string | null;
  is_enabled_globally: boolean;
  rollout_percentage: number;
  environment: string;
  targeting_rules: Prisma.JsonValue;
}) {
  return {
    id: flag.id,
    key: flag.key,
    description: flag.description,
    isEnabledGlobally: flag.is_enabled_globally,
    rolloutPercentage: flag.rollout_percentage,
    environment: flag.environment,
    targetingRules: flag.targeting_rules,
  };
}

function serializeDashboardPage(page: {
  id: string;
  name: string;
  route: string;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  module_id: string | null;
  feature_id: string | null;
  is_visible: boolean;
  is_enabled: boolean;
}) {
  return {
    id: page.id,
    name: page.name,
    route: page.route,
    icon: page.icon,
    parentId: page.parent_id,
    sortOrder: page.sort_order,
    moduleId: page.module_id,
    featureId: page.feature_id,
    isVisible: page.is_visible,
    isEnabled: page.is_enabled,
  };
}

// ── Features ────────────────────────────────────────────────────────────────

export async function listFeatures() {
  const features = await prisma.feature.findMany({ orderBy: { code: 'asc' } });
  return features.map(serializeFeature);
}

export async function createFeature(input: {
  code: string;
  name: string;
  featureGroupId?: string;
  moduleId?: string;
  description?: string;
  isGlobalDefaultEnabled?: boolean;
  requiresPermissionId?: string;
}) {
  try {
    const feature = await prisma.feature.create({
      data: {
        code: input.code,
        name: input.name,
        feature_group_id: input.featureGroupId ?? null,
        module_id: input.moduleId ?? null,
        description: input.description ?? null,
        is_global_default_enabled: input.isGlobalDefaultEnabled ?? false,
        requires_permission_id: input.requiresPermissionId ?? null,
      },
    });
    return serializeFeature(feature);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Feature code already exists');
    }
    throw err;
  }
}

export async function updateFeature(
  featureId: string,
  input: {
    name?: string;
    featureGroupId?: string | null;
    moduleId?: string | null;
    description?: string | null;
    isGlobalDefaultEnabled?: boolean;
    requiresPermissionId?: string | null;
  },
) {
  const existing = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!existing) {
    throw new NotFoundError('Feature not found');
  }

  const feature = await prisma.feature.update({
    where: { id: featureId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.featureGroupId !== undefined ? { feature_group_id: input.featureGroupId } : {}),
      ...(input.moduleId !== undefined ? { module_id: input.moduleId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isGlobalDefaultEnabled !== undefined
        ? { is_global_default_enabled: input.isGlobalDefaultEnabled }
        : {}),
      ...(input.requiresPermissionId !== undefined
        ? { requires_permission_id: input.requiresPermissionId }
        : {}),
    },
  });
  return serializeFeature(feature);
}

export async function deleteFeature(featureId: string) {
  const existing = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!existing) {
    throw new NotFoundError('Feature not found');
  }
  await prisma.feature.delete({ where: { id: featureId } });
}

// ── Feature groups ────────────────────────────────────────────────────────────

export async function listFeatureGroups() {
  const groups = await prisma.featureGroup.findMany({ orderBy: { sort_order: 'asc' } });
  return groups.map(serializeFeatureGroup);
}

export async function createFeatureGroup(input: { name: string; sortOrder?: number }) {
  const group = await prisma.featureGroup.create({
    data: {
      name: input.name,
      sort_order: input.sortOrder ?? 0,
    },
  });
  return serializeFeatureGroup(group);
}

export async function updateFeatureGroup(
  groupId: string,
  input: { name?: string; sortOrder?: number },
) {
  const existing = await prisma.featureGroup.findUnique({ where: { id: groupId } });
  if (!existing) {
    throw new NotFoundError('Feature group not found');
  }
  const group = await prisma.featureGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    },
  });
  return serializeFeatureGroup(group);
}

export async function deleteFeatureGroup(groupId: string) {
  const existing = await prisma.featureGroup.findUnique({ where: { id: groupId } });
  if (!existing) {
    throw new NotFoundError('Feature group not found');
  }
  await prisma.featureGroup.delete({ where: { id: groupId } });
}

// ── Modules ───────────────────────────────────────────────────────────────────

export async function listModules(audience?: 'company' | 'dashboard') {
  const modules = await prisma.module.findMany({
    where: audience ? { audience } : undefined,
    orderBy: [{ sort_order: 'asc' }, { code: 'asc' }],
  });
  return modules.map(serializeModule);
}

export async function createModule(input: {
  code: string;
  name: string;
  description?: string;
  isCore?: boolean;
  sortOrder?: number;
  audience: 'company' | 'dashboard';
}) {
  try {
    const mod = await prisma.module.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        is_core: input.isCore ?? false,
        sort_order: input.sortOrder ?? 0,
        audience: input.audience,
      },
    });
    return serializeModule(mod);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Module code already exists');
    }
    throw err;
  }
}

export async function updateModule(
  moduleId: string,
  input: {
    name?: string;
    description?: string | null;
    isCore?: boolean;
    sortOrder?: number;
    audience?: 'company' | 'dashboard';
  },
) {
  const existing = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!existing) {
    throw new NotFoundError('Module not found');
  }
  const mod = await prisma.module.update({
    where: { id: moduleId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isCore !== undefined ? { is_core: input.isCore } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      ...(input.audience !== undefined ? { audience: input.audience } : {}),
    },
  });
  return serializeModule(mod);
}

export async function deleteModule(moduleId: string) {
  const existing = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!existing) {
    throw new NotFoundError('Module not found');
  }
  await prisma.module.delete({ where: { id: moduleId } });
}

// ── Company features / modules ────────────────────────────────────────────────

export async function listCompanyFeatures(companyId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId } });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  const rows = await prisma.companyFeature.findMany({
    where: { company_id: companyId },
    include: { feature: true },
  });

  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    featureId: row.feature_id,
    featureCode: row.feature.code,
    isEnabled: row.is_enabled,
    enabledFrom: row.enabled_from?.toISOString() ?? null,
    enabledUntil: row.enabled_until?.toISOString() ?? null,
    config: row.config,
  }));
}

export async function upsertCompanyFeatures(
  companyId: string,
  features: Array<{
    featureId: string;
    isEnabled: boolean;
    enabledFrom?: string;
    enabledUntil?: string;
    config?: Record<string, unknown>;
  }>,
) {
  const company = await prisma.company.findFirst({ where: { id: companyId } });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  await prisma.$transaction(async (tx) => {
    for (const f of features) {
      await tx.companyFeature.upsert({
        where: {
          company_id_feature_id: { company_id: companyId, feature_id: f.featureId },
        },
        create: {
          company_id: companyId,
          feature_id: f.featureId,
          is_enabled: f.isEnabled,
          enabled_from: f.enabledFrom ? new Date(f.enabledFrom) : null,
          enabled_until: f.enabledUntil ? new Date(f.enabledUntil) : null,
          config: f.config ?? Prisma.JsonNull,
        },
        update: {
          is_enabled: f.isEnabled,
          enabled_from: f.enabledFrom ? new Date(f.enabledFrom) : null,
          enabled_until: f.enabledUntil ? new Date(f.enabledUntil) : null,
          ...(f.config !== undefined ? { config: f.config } : {}),
        },
      });
    }
  });

  await moduleFeatureResolver.invalidateCompanyModulesCache(companyId);
  return listCompanyFeatures(companyId);
}

export async function listCompanyModules(companyId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId } });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  const rows = await prisma.companyModule.findMany({
    where: { company_id: companyId },
    include: { module: true },
  });

  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    moduleId: row.module_id,
    moduleCode: row.module.code,
    isEnabled: row.is_enabled,
    enabledFrom: row.enabled_from?.toISOString() ?? null,
    enabledUntil: row.enabled_until?.toISOString() ?? null,
  }));
}

export async function upsertCompanyModules(
  companyId: string,
  modules: Array<{
    moduleId: string;
    isEnabled: boolean;
    enabledFrom?: string;
    enabledUntil?: string;
  }>,
) {
  const company = await prisma.company.findFirst({ where: { id: companyId } });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  await prisma.$transaction(async (tx) => {
    for (const m of modules) {
      await tx.companyModule.upsert({
        where: {
          company_id_module_id: { company_id: companyId, module_id: m.moduleId },
        },
        create: {
          company_id: companyId,
          module_id: m.moduleId,
          is_enabled: m.isEnabled,
          enabled_from: m.enabledFrom ? new Date(m.enabledFrom) : null,
          enabled_until: m.enabledUntil ? new Date(m.enabledUntil) : null,
        },
        update: {
          is_enabled: m.isEnabled,
          enabled_from: m.enabledFrom ? new Date(m.enabledFrom) : null,
          enabled_until: m.enabledUntil ? new Date(m.enabledUntil) : null,
        },
      });
    }
  });

  await moduleFeatureResolver.invalidateCompanyModulesCache(companyId);
  return listCompanyModules(companyId);
}

// ── Feature flags ─────────────────────────────────────────────────────────────

export async function listFeatureFlags() {
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  return flags.map(serializeFeatureFlag);
}

export async function createFeatureFlag(input: {
  key: string;
  description?: string;
  isEnabledGlobally?: boolean;
  rolloutPercentage?: number;
  environment?: string;
  targetingRules?: Record<string, unknown>;
}) {
  try {
    const flag = await prisma.featureFlag.create({
      data: {
        key: input.key,
        description: input.description ?? null,
        is_enabled_globally: input.isEnabledGlobally ?? false,
        rollout_percentage: input.rolloutPercentage ?? 0,
        environment: input.environment ?? 'all',
        targeting_rules: input.targetingRules ?? Prisma.JsonNull,
      },
    });
    return serializeFeatureFlag(flag);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Feature flag key already exists');
    }
    throw err;
  }
}

export async function updateFeatureFlag(
  flagId: string,
  input: {
    description?: string | null;
    isEnabledGlobally?: boolean;
    rolloutPercentage?: number;
    environment?: string;
    targetingRules?: Record<string, unknown> | null;
  },
) {
  const existing = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!existing) {
    throw new NotFoundError('Feature flag not found');
  }
  const flag = await prisma.featureFlag.update({
    where: { id: flagId },
    data: {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isEnabledGlobally !== undefined
        ? { is_enabled_globally: input.isEnabledGlobally }
        : {}),
      ...(input.rolloutPercentage !== undefined
        ? { rollout_percentage: input.rolloutPercentage }
        : {}),
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
      ...(input.targetingRules !== undefined
        ? {
            targeting_rules:
              input.targetingRules === null ? Prisma.JsonNull : input.targetingRules,
          }
        : {}),
    },
  });
  return serializeFeatureFlag(flag);
}

export async function deleteFeatureFlag(flagId: string) {
  const existing = await prisma.featureFlag.findUnique({ where: { id: flagId } });
  if (!existing) {
    throw new NotFoundError('Feature flag not found');
  }
  await prisma.featureFlag.delete({ where: { id: flagId } });
}

// ── Dashboard pages ───────────────────────────────────────────────────────────

export async function listDashboardPages() {
  const pages = await prisma.dashboardPage.findMany({
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  });
  return pages.map(serializeDashboardPage);
}

export async function createDashboardPage(input: {
  name: string;
  route: string;
  icon?: string;
  parentId?: string;
  sortOrder?: number;
  moduleId?: string;
  featureId?: string;
  isVisible?: boolean;
  isEnabled?: boolean;
}) {
  const page = await prisma.dashboardPage.create({
    data: {
      name: input.name,
      route: input.route,
      icon: input.icon ?? null,
      parent_id: input.parentId ?? null,
      sort_order: input.sortOrder ?? 0,
      module_id: input.moduleId ?? null,
      feature_id: input.featureId ?? null,
      is_visible: input.isVisible ?? true,
      is_enabled: input.isEnabled ?? true,
    },
  });
  await permissionResolver.invalidateAll();
  return serializeDashboardPage(page);
}

export async function updateDashboardPage(
  pageId: string,
  input: {
    name?: string;
    route?: string;
    icon?: string | null;
    parentId?: string | null;
    sortOrder?: number;
    moduleId?: string | null;
    featureId?: string | null;
    isVisible?: boolean;
    isEnabled?: boolean;
  },
) {
  const existing = await prisma.dashboardPage.findUnique({ where: { id: pageId } });
  if (!existing) {
    throw new NotFoundError('Dashboard page not found');
  }
  const page = await prisma.dashboardPage.update({
    where: { id: pageId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.route !== undefined ? { route: input.route } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.parentId !== undefined ? { parent_id: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      ...(input.moduleId !== undefined ? { module_id: input.moduleId } : {}),
      ...(input.featureId !== undefined ? { feature_id: input.featureId } : {}),
      ...(input.isVisible !== undefined ? { is_visible: input.isVisible } : {}),
      ...(input.isEnabled !== undefined ? { is_enabled: input.isEnabled } : {}),
    },
  });
  await permissionResolver.invalidateAll();
  return serializeDashboardPage(page);
}

export async function deleteDashboardPage(pageId: string) {
  const existing = await prisma.dashboardPage.findUnique({ where: { id: pageId } });
  if (!existing) {
    throw new NotFoundError('Dashboard page not found');
  }
  await prisma.dashboardPage.delete({ where: { id: pageId } });
  await permissionResolver.invalidateAll();
}

// ── Dashboard role modules / features ─────────────────────────────────────────

export async function setRoleModules(
  roleId: string,
  modules: Array<{ moduleId: string; isEnabled: boolean }>,
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.dashboardRoleModule.deleteMany({ where: { role_id: roleId } });
    if (modules.length > 0) {
      await tx.dashboardRoleModule.createMany({
        data: modules.map((m) => ({
          role_id: roleId,
          module_id: m.moduleId,
          is_enabled: m.isEnabled,
        })),
      });
    }
  });

  return { roleId, count: modules.length };
}

export async function setRoleFeatures(
  roleId: string,
  features: Array<{ featureId: string; isEnabled: boolean }>,
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.dashboardRoleFeature.deleteMany({ where: { role_id: roleId } });
    if (features.length > 0) {
      await tx.dashboardRoleFeature.createMany({
        data: features.map((f) => ({
          role_id: roleId,
          feature_id: f.featureId,
          is_enabled: f.isEnabled,
        })),
      });
    }
  });

  return { roleId, count: features.length };
}

export async function listRoleModules(roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!role) {
    throw new NotFoundError('Role not found');
  }
  const rows = await prisma.dashboardRoleModule.findMany({
    where: { role_id: roleId },
    include: { module: true },
  });
  return rows.map((r) => ({
    roleId: r.role_id,
    moduleId: r.module_id,
    moduleCode: r.module.code,
    isEnabled: r.is_enabled,
  }));
}

export async function listRoleFeatures(roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!role) {
    throw new NotFoundError('Role not found');
  }
  const rows = await prisma.dashboardRoleFeature.findMany({
    where: { role_id: roleId },
    include: { feature: true },
  });
  return rows.map((r) => ({
    roleId: r.role_id,
    featureId: r.feature_id,
    featureCode: r.feature.code,
    isEnabled: r.is_enabled,
  }));
}
