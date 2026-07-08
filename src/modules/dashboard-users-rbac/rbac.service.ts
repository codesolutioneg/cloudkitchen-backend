import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma/client';
import { ConflictError, NotFoundError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';
import { permissionResolver } from '../../engines/permissionResolver';
import type { RequestActor } from '../../core/middleware/requestContext';

function serializeRole(role: {
  id: string;
  name: string;
  scope: string;
  is_system_role: boolean;
  description: string | null;
}) {
  return {
    id: role.id,
    name: role.name,
    scope: role.scope,
    isSystemRole: role.is_system_role,
    description: role.description,
  };
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    where: { is_deleted: false },
    orderBy: { name: 'asc' },
  });
  return roles.map(serializeRole);
}

export async function getRole(roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!role) {
    throw new NotFoundError('Role not found');
  }
  return serializeRole(role);
}

export async function listDashboardUsers(query: { page?: number; pageSize?: number }) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const where = { is_deleted: false };

  const [users, totalItems] = await prisma.$transaction([
    prisma.dashboardUser.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
      include: {
        roles: { include: { role: true } },
      },
    }),
    prisma.dashboardUser.count({ where }),
  ]);

  return {
    items: users.map((u) => ({
      id: u.id,
      fullName: u.full_name,
      email: u.email,
      status: u.status,
      department: u.department,
      roles: u.roles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
      createdAt: u.created_at.toISOString(),
    })),
    pagination: { page, pageSize, totalItems },
  };
}

export async function createRole(input: {
  name: string;
  description?: string;
  isSystemRole?: boolean;
}) {
  try {
    const role = await prisma.role.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        is_system_role: input.isSystemRole ?? false,
        scope: 'platform',
      },
    });
    return serializeRole(role);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Role name already exists');
    }
    throw err;
  }
}

export async function updateRole(
  roleId: string,
  input: { name?: string; description?: string },
) {
  const existing = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!existing) {
    throw new NotFoundError('Role not found');
  }

  const role = await prisma.role.update({
    where: { id: roleId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
  return serializeRole(role);
}

export async function setRolePermissions(
  roleId: string,
  permissions: Array<{ permissionId: string; effect: 'allow' | 'deny' }>,
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { role_id: roleId } });
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((p) => ({
          role_id: roleId,
          permission_id: p.permissionId,
          effect: p.effect,
        })),
      });
    }
  });

  await permissionResolver.invalidateAll();
  return { roleId, count: permissions.length };
}

export async function setRolePagePermissions(
  roleId: string,
  pages: Array<{
    pageId: string;
    canView?: boolean;
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canApprove?: boolean;
    canReject?: boolean;
    canExport?: boolean;
    canImport?: boolean;
  }>,
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, is_deleted: false } });
  if (!role) {
    throw new NotFoundError('Role not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.rolePagePermission.deleteMany({ where: { role_id: roleId } });
    if (pages.length > 0) {
      await tx.rolePagePermission.createMany({
        data: pages.map((p) => ({
          role_id: roleId,
          page_id: p.pageId,
          can_view: p.canView ?? false,
          can_create: p.canCreate ?? false,
          can_edit: p.canEdit ?? false,
          can_delete: p.canDelete ?? false,
          can_approve: p.canApprove ?? false,
          can_reject: p.canReject ?? false,
          can_export: p.canExport ?? false,
          can_import: p.canImport ?? false,
        })),
      });
    }
  });

  return { roleId, count: pages.length };
}

export async function inviteDashboardUser(
  input: {
    fullName: string;
    email: string;
    department?: string;
    temporaryPassword?: string;
  },
  actor: RequestActor,
) {
  const email = input.email.toLowerCase().trim();
  const password = input.temporaryPassword ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.dashboardUser.create({
      data: {
        full_name: input.fullName,
        email,
        password_hash: passwordHash,
        department: input.department ?? null,
        status: 'invited',
        created_by_type: actor.type,
        created_by_id: actor.id,
      },
    });

    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      status: user.status,
      department: user.department,
    };
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Dashboard user email already exists');
    }
    throw err;
  }
}

export async function assignUserRoles(
  dashboardUserId: string,
  roleIds: string[],
  actor: RequestActor,
) {
  const user = await prisma.dashboardUser.findFirst({
    where: { id: dashboardUserId, is_deleted: false },
  });
  if (!user) {
    throw new NotFoundError('Dashboard user not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.dashboardUserRole.deleteMany({ where: { dashboard_user_id: dashboardUserId } });
    if (roleIds.length > 0) {
      await tx.dashboardUserRole.createMany({
        data: roleIds.map((roleId) => ({
          dashboard_user_id: dashboardUserId,
          role_id: roleId,
          assigned_by: actor.id,
        })),
      });
    }
  });

  await permissionResolver.invalidateUser(dashboardUserId);
  return { dashboardUserId, roleIds };
}

export async function setUserCompanyScope(
  dashboardUserId: string,
  input: {
    scopeType: 'all' | 'specific';
    companyIds?: string[];
  },
  actor: RequestActor,
) {
  const user = await prisma.dashboardUser.findFirst({
    where: { id: dashboardUserId, is_deleted: false },
  });
  if (!user) {
    throw new NotFoundError('Dashboard user not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.dashboardUserCompanyScope.upsert({
      where: { dashboard_user_id: dashboardUserId },
      create: {
        dashboard_user_id: dashboardUserId,
        scope_type: input.scopeType,
        updated_by: actor.id,
      },
      update: {
        scope_type: input.scopeType,
        updated_by: actor.id,
      },
    });

    await tx.dashboardUserCompanyAssignment.deleteMany({
      where: { dashboard_user_id: dashboardUserId },
    });

    if (input.scopeType === 'specific' && input.companyIds?.length) {
      await tx.dashboardUserCompanyAssignment.createMany({
        data: input.companyIds.map((companyId) => ({
          dashboard_user_id: dashboardUserId,
          company_id: companyId,
          assigned_by: actor.id,
        })),
      });
    }
  });

  return {
    dashboardUserId,
    scopeType: input.scopeType,
    companyIds: input.companyIds ?? [],
  };
}

export async function listCompanyUsers(companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, is_deleted: false },
  });
  if (!company) {
    throw new NotFoundError('Company not found');
  }

  const users = await prisma.companyUser.findMany({
    where: { company_id: companyId, is_deleted: false },
    orderBy: { created_at: 'desc' },
  });

  return users.map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    mobile: u.mobile,
    status: u.status,
    isPrimaryContact: u.is_primary_contact,
    lastLoginAt: u.last_login_at?.toISOString() ?? null,
  }));
}

export async function listPermissions() {
  const groups = await prisma.permissionGroup.findMany({
    orderBy: { sort_order: 'asc' },
    include: { permissions: { orderBy: { code: 'asc' } } },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    permissions: g.permissions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
    })),
  }));
}
