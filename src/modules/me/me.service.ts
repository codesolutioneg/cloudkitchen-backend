import { prisma } from '../../prisma/client';
import { ForbiddenError } from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';
import { moduleFeatureResolver } from '../../engines/moduleFeatureResolver';

export interface NavigationNode {
  id: string;
  name: string;
  route: string;
  icon: string | null;
  sortOrder: number;
  permissions: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    canReject: boolean;
    canExport: boolean;
    canImport: boolean;
  };
  children: NavigationNode[];
}

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

function getDashboardActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'dashboard_user') {
    throw new ForbiddenError('Dashboard authentication required');
  }
  return actor;
}

async function loadDashboardUserRoleIds(dashboardUserId: string): Promise<string[]> {
  const rows = await prisma.dashboardUserRole.findMany({
    where: { dashboard_user_id: dashboardUserId },
    select: { role_id: true },
  });
  return rows.map((r) => r.role_id);
}

async function expandInheritedRoleIds(roleIds: string[]): Promise<Set<string>> {
  const expanded = new Set(roleIds);
  const queue = [...roleIds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const parents = await prisma.roleInheritance.findMany({
      where: { child_role_id: current },
      select: { parent_role_id: true },
    });
    for (const p of parents) {
      if (!expanded.has(p.parent_role_id)) {
        expanded.add(p.parent_role_id);
        queue.push(p.parent_role_id);
      }
    }
  }

  return expanded;
}

/** GET /me/modules — flat feature flags for the caller's company (§8.9, §12). */
export async function getCompanyModules() {
  const actor = getCompanyActorOrThrow();
  return moduleFeatureResolver.resolveCompanyModules(actor.companyId);
}

/** GET /me/navigation — dashboard page tree for caller's role(s) (§8.9, §12). */
export async function getDashboardNavigation(): Promise<NavigationNode[]> {
  const actor = getDashboardActorOrThrow();
  const roleIds = await loadDashboardUserRoleIds(actor.id);
  const expandedRoles = await expandInheritedRoleIds(roleIds);

  const pages = await prisma.dashboardPage.findMany({
    where: { is_enabled: true, is_visible: true },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  });

  const pagePerms =
    expandedRoles.size > 0
      ? await prisma.rolePagePermission.findMany({
          where: { role_id: { in: [...expandedRoles] } },
        })
      : [];

  const permByPage = new Map<
    string,
    {
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canApprove: boolean;
      canReject: boolean;
      canExport: boolean;
      canImport: boolean;
    }
  >();

  for (const perm of pagePerms) {
    const existing = permByPage.get(perm.page_id) ?? {
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canReject: false,
      canExport: false,
      canImport: false,
    };
    permByPage.set(perm.page_id, {
      canView: existing.canView || perm.can_view,
      canCreate: existing.canCreate || perm.can_create,
      canEdit: existing.canEdit || perm.can_edit,
      canDelete: existing.canDelete || perm.can_delete,
      canApprove: existing.canApprove || perm.can_approve,
      canReject: existing.canReject || perm.can_reject,
      canExport: existing.canExport || perm.can_export,
      canImport: existing.canImport || perm.can_import,
    });
  }

  const visiblePages: NavigationNode[] = [];

  for (const page of pages) {
    const perms = permByPage.get(page.id);
    if (!perms?.canView) {
      continue;
    }

    if (page.module_id) {
      const moduleOn = await moduleFeatureResolver.isModuleEnabled(
        { audience: 'dashboard', dashboardUserId: actor.id },
        page.module_id,
      );
      if (!moduleOn) {
        continue;
      }
    }

    if (page.feature_id) {
      const featureOn = await moduleFeatureResolver.isFeatureEnabled(
        { audience: 'dashboard', dashboardUserId: actor.id },
        page.feature_id,
      );
      if (!featureOn) {
        continue;
      }
    }

    visiblePages.push({
      id: page.id,
      name: page.name,
      route: page.route,
      icon: page.icon,
      sortOrder: page.sort_order,
      permissions: perms,
      children: [],
    });
  }

  const byId = new Map(visiblePages.map((p) => [p.id, p]));
  const roots: NavigationNode[] = [];

  for (const page of pages) {
    const node = byId.get(page.id);
    if (!node) {
      continue;
    }
    if (page.parent_id && byId.has(page.parent_id)) {
      byId.get(page.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export const meService = {
  getCompanyModules,
  getDashboardNavigation,
};
