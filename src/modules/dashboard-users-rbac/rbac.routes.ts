import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  assignRolesSchema,
  companyIdParamsSchema,
  companyScopeSchema,
  createRoleSchema,
  inviteUserSchema,
  roleIdParamsSchema,
  setRolePagePermissionsSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
  userIdParamsSchema,
} from './rbac.schemas';
import * as controller from './rbac.controller';

const router = Router();

router.get(
  '/dashboard/roles',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/roles', 'view'),
  asyncHandler(controller.listRoles),
);

router.get(
  '/dashboard/roles/:id',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/roles', 'view'),
  validate(roleIdParamsSchema, 'params'),
  asyncHandler(controller.getRole),
);

router.post(
  '/dashboard/roles',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/roles', 'create'),
  validate(createRoleSchema),
  asyncHandler(controller.createRole),
);

router.patch(
  '/dashboard/roles/:id',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/roles', 'edit'),
  validate(roleIdParamsSchema, 'params'),
  validate(updateRoleSchema),
  asyncHandler(controller.updateRole),
);

router.put(
  '/dashboard/roles/:id/permissions',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/roles', 'edit'),
  validate(roleIdParamsSchema, 'params'),
  validate(setRolePermissionsSchema),
  asyncHandler(controller.setRolePermissions),
);

router.put(
  '/dashboard/roles/:id/page-permissions',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/roles', 'edit'),
  validate(roleIdParamsSchema, 'params'),
  validate(setRolePagePermissionsSchema),
  asyncHandler(controller.setRolePagePermissions),
);

router.get(
  '/dashboard/permissions',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/roles', 'view'),
  asyncHandler(controller.listPermissions),
);

router.get(
  '/dashboard/users',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/users', 'view'),
  asyncHandler(controller.listDashboardUsers),
);

router.post(
  '/dashboard/users',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/users', 'create'),
  validate(inviteUserSchema),
  asyncHandler(controller.inviteUser),
);

router.post(
  '/dashboard/users/:id/roles',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/users', 'edit'),
  validate(userIdParamsSchema, 'params'),
  validate(assignRolesSchema),
  asyncHandler(controller.assignRoles),
);

router.put(
  '/dashboard/users/:id/company-scope',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/users', 'edit'),
  validate(userIdParamsSchema, 'params'),
  validate(companyScopeSchema),
  asyncHandler(controller.setCompanyScope),
);

router.get(
  '/dashboard/companies/:id/users',
  dashboardAuthMiddleware,
  requirePagePermission('/dashboard/companies', 'view'),
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.listCompanyUsers),
);

export default router;
