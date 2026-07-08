import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  companyIdParamsSchema,
  createDashboardPageSchema,
  createFeatureFlagSchema,
  createFeatureGroupSchema,
  createFeatureSchema,
  createModuleSchema,
  idParamsSchema,
  listModulesQuerySchema,
  roleIdParamsSchema,
  setRoleFeaturesSchema,
  setRoleModulesSchema,
  updateDashboardPageSchema,
  updateFeatureFlagSchema,
  updateFeatureGroupSchema,
  updateFeatureSchema,
  updateModuleSchema,
  upsertCompanyFeaturesSchema,
  upsertCompanyModulesSchema,
} from './features.schemas';
import * as controller from './features.controller';

const router = Router();
const auth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/features', 'view');
const canCreate = requirePagePermission('/dashboard/features', 'create');
const canEdit = requirePagePermission('/dashboard/features', 'edit');
const canDelete = requirePagePermission('/dashboard/features', 'delete');

router.get('/dashboard/features', auth, canView, asyncHandler(controller.listFeatures));
router.post(
  '/dashboard/features',
  auth,
  canCreate,
  validate(createFeatureSchema),
  asyncHandler(controller.createFeature),
);
router.patch(
  '/dashboard/features/:id',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateFeatureSchema),
  asyncHandler(controller.updateFeature),
);
router.delete(
  '/dashboard/features/:id',
  auth,
  canDelete,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteFeature),
);

router.get('/dashboard/feature-groups', auth, canView, asyncHandler(controller.listFeatureGroups));
router.post(
  '/dashboard/feature-groups',
  auth,
  canCreate,
  validate(createFeatureGroupSchema),
  asyncHandler(controller.createFeatureGroup),
);
router.patch(
  '/dashboard/feature-groups/:id',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateFeatureGroupSchema),
  asyncHandler(controller.updateFeatureGroup),
);
router.delete(
  '/dashboard/feature-groups/:id',
  auth,
  canDelete,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteFeatureGroup),
);

router.get(
  '/dashboard/modules',
  auth,
  canView,
  validate(listModulesQuerySchema, 'query'),
  asyncHandler(controller.listModules),
);
router.post(
  '/dashboard/modules',
  auth,
  canCreate,
  validate(createModuleSchema),
  asyncHandler(controller.createModule),
);
router.patch(
  '/dashboard/modules/:id',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateModuleSchema),
  asyncHandler(controller.updateModule),
);
router.delete(
  '/dashboard/modules/:id',
  auth,
  canDelete,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteModule),
);

router.get(
  '/dashboard/companies/:companyId/features',
  auth,
  canView,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.listCompanyFeatures),
);
router.put(
  '/dashboard/companies/:companyId/features',
  auth,
  canEdit,
  validate(companyIdParamsSchema, 'params'),
  validate(upsertCompanyFeaturesSchema),
  asyncHandler(controller.upsertCompanyFeatures),
);

router.get(
  '/dashboard/companies/:companyId/modules',
  auth,
  canView,
  validate(companyIdParamsSchema, 'params'),
  asyncHandler(controller.listCompanyModules),
);
router.put(
  '/dashboard/companies/:companyId/modules',
  auth,
  canEdit,
  validate(companyIdParamsSchema, 'params'),
  validate(upsertCompanyModulesSchema),
  asyncHandler(controller.upsertCompanyModules),
);

router.get('/dashboard/feature-flags', auth, canView, asyncHandler(controller.listFeatureFlags));
router.post(
  '/dashboard/feature-flags',
  auth,
  canCreate,
  validate(createFeatureFlagSchema),
  asyncHandler(controller.createFeatureFlag),
);
router.patch(
  '/dashboard/feature-flags/:id',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateFeatureFlagSchema),
  asyncHandler(controller.updateFeatureFlag),
);
router.delete(
  '/dashboard/feature-flags/:id',
  auth,
  canDelete,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteFeatureFlag),
);

router.get(
  '/dashboard/dashboard-pages',
  auth,
  canView,
  asyncHandler(controller.listDashboardPages),
);
router.post(
  '/dashboard/dashboard-pages',
  auth,
  canCreate,
  validate(createDashboardPageSchema),
  asyncHandler(controller.createDashboardPage),
);
router.patch(
  '/dashboard/dashboard-pages/:id',
  auth,
  canEdit,
  validate(idParamsSchema, 'params'),
  validate(updateDashboardPageSchema),
  asyncHandler(controller.updateDashboardPage),
);
router.delete(
  '/dashboard/dashboard-pages/:id',
  auth,
  canDelete,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteDashboardPage),
);

router.get(
  '/dashboard/roles/:roleId/modules',
  auth,
  canView,
  validate(roleIdParamsSchema, 'params'),
  asyncHandler(controller.listRoleModules),
);
router.put(
  '/dashboard/roles/:roleId/modules',
  auth,
  canEdit,
  validate(roleIdParamsSchema, 'params'),
  validate(setRoleModulesSchema),
  asyncHandler(controller.setRoleModules),
);

router.get(
  '/dashboard/roles/:roleId/features',
  auth,
  canView,
  validate(roleIdParamsSchema, 'params'),
  asyncHandler(controller.listRoleFeatures),
);
router.put(
  '/dashboard/roles/:roleId/features',
  auth,
  canEdit,
  validate(roleIdParamsSchema, 'params'),
  validate(setRoleFeaturesSchema),
  asyncHandler(controller.setRoleFeatures),
);

export default router;
