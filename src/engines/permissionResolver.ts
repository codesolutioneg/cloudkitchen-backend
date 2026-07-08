import { prisma } from '../prisma/client';
import { cacheDeleteByPrefix, cacheGet, cacheSet } from '../core/utils/cache';

export type PageAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'export'
  | 'import';

const ACTION_FIELD: Record<PageAction, keyof {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_reject: boolean;
  can_export: boolean;
  can_import: boolean;
}> = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
  approve: 'can_approve',
  reject: 'can_reject',
  export: 'can_export',
  import: 'can_import',
};

async function loadUserRoleIds(dashboardUserId: string): Promise<string[]> {
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

export const permissionResolver = {
  async invalidateUser(dashboardUserId: string): Promise<void> {
    await cacheDeleteByPrefix(`perm:${dashboardUserId}:`);
    await cacheDeleteByPrefix(`permcode:${dashboardUserId}:`);
  },

  async invalidateAll(): Promise<void> {
    await cacheDeleteByPrefix('perm:');
    await cacheDeleteByPrefix('permcode:');
  },

  async canAsync(
    dashboardUserId: string,
    pageRoute: string,
    action: PageAction,
  ): Promise<boolean> {
    const cacheKey = `perm:${dashboardUserId}:${pageRoute}:${action}`;
    const cached = await cacheGet<boolean>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const page = await prisma.dashboardPage.findFirst({
      where: { route: pageRoute, is_enabled: true, is_visible: true },
    });
    if (!page) {
      await cacheSet(cacheKey, false);
      return false;
    }

    const roleIds = await loadUserRoleIds(dashboardUserId);
    if (roleIds.length === 0) {
      await cacheSet(cacheKey, false);
      return false;
    }

    const expandedRoles = await expandInheritedRoleIds(roleIds);
    const field = ACTION_FIELD[action];

    const pagePerms = await prisma.rolePagePermission.findMany({
      where: {
        page_id: page.id,
        role_id: { in: [...expandedRoles] },
      },
    });

    const allowed = pagePerms.some((p) => p[field] === true);

    await cacheSet(cacheKey, allowed);
    return allowed;
  },

  async hasPermissionCode(dashboardUserId: string, code: string): Promise<boolean> {
    const cacheKey = `permcode:${dashboardUserId}:${code}`;
    const cached = await cacheGet<boolean>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const permission = await prisma.permission.findUnique({ where: { code } });
    if (!permission) {
      await cacheSet(cacheKey, false);
      return false;
    }

    const roleIds = await expandInheritedRoleIds(await loadUserRoleIds(dashboardUserId));
    const rolePerms = await prisma.rolePermission.findMany({
      where: {
        permission_id: permission.id,
        role_id: { in: [...roleIds] },
      },
    });

    let allowed = rolePerms.some((rp) => rp.effect === 'allow');
    if (rolePerms.some((rp) => rp.effect === 'deny')) {
      allowed = false;
    }

    const overrides = await prisma.permissionOverride.findMany({
      where: {
        scope_id: dashboardUserId,
        scope_type: 'dashboard_user',
        permission_id: permission.id,
      },
    });
    for (const o of overrides) {
      if (o.effect === 'deny') {
        allowed = false;
      } else if (o.effect === 'allow') {
        allowed = true;
      }
    }

    await cacheSet(cacheKey, allowed);
    return allowed;
  },
};
