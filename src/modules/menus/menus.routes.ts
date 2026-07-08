import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import { dashboardAuthMiddleware } from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  addSectionProductSchema,
  assignmentIdParamsSchema,
  createAssignmentSchema,
  createMenuSchema,
  createSectionSchema,
  menuIdParamsSchema,
  sectionIdParamsSchema,
  sectionProductParamsSchema,
  updateMenuSchema,
  updateSectionSchema,
} from './menus.schemas';
import * as controller from './menus.controller';

const router = Router();
const auth = dashboardAuthMiddleware;
const canView = requirePagePermission('/dashboard/menus', 'view');
const canCreate = requirePagePermission('/dashboard/menus', 'create');
const canEdit = requirePagePermission('/dashboard/menus', 'edit');
const canDelete = requirePagePermission('/dashboard/menus', 'delete');

router.get('/dashboard/menus', auth, canView, asyncHandler(controller.listMenus));
router.get(
  '/dashboard/menus/:id',
  auth,
  canView,
  validate(menuIdParamsSchema, 'params'),
  asyncHandler(controller.getMenu),
);
router.post(
  '/dashboard/menus',
  auth,
  canCreate,
  validate(createMenuSchema),
  asyncHandler(controller.createMenu),
);
router.patch(
  '/dashboard/menus/:id',
  auth,
  canEdit,
  validate(menuIdParamsSchema, 'params'),
  validate(updateMenuSchema),
  asyncHandler(controller.updateMenu),
);
router.delete(
  '/dashboard/menus/:id',
  auth,
  canDelete,
  validate(menuIdParamsSchema, 'params'),
  asyncHandler(controller.deleteMenu),
);

router.get(
  '/dashboard/menus/:id/sections',
  auth,
  canView,
  validate(menuIdParamsSchema, 'params'),
  asyncHandler(controller.listSections),
);
router.post(
  '/dashboard/menus/:id/sections',
  auth,
  canCreate,
  validate(menuIdParamsSchema, 'params'),
  validate(createSectionSchema),
  asyncHandler(controller.createSection),
);
router.patch(
  '/dashboard/menus/:id/sections/:sectionId',
  auth,
  canEdit,
  validate(sectionIdParamsSchema, 'params'),
  validate(updateSectionSchema),
  asyncHandler(controller.updateSection),
);
router.delete(
  '/dashboard/menus/:id/sections/:sectionId',
  auth,
  canDelete,
  validate(sectionIdParamsSchema, 'params'),
  asyncHandler(controller.deleteSection),
);

router.get(
  '/dashboard/menus/:id/sections/:sectionId/products',
  auth,
  canView,
  validate(sectionIdParamsSchema, 'params'),
  asyncHandler(controller.listSectionProducts),
);
router.post(
  '/dashboard/menus/:id/sections/:sectionId/products',
  auth,
  canCreate,
  validate(sectionIdParamsSchema, 'params'),
  validate(addSectionProductSchema),
  asyncHandler(controller.addProductToSection),
);
router.delete(
  '/dashboard/menus/:id/sections/:sectionId/products/:productId',
  auth,
  canDelete,
  validate(sectionProductParamsSchema, 'params'),
  asyncHandler(controller.removeProductFromSection),
);

router.get(
  '/dashboard/menus/:id/assignments',
  auth,
  canView,
  validate(menuIdParamsSchema, 'params'),
  asyncHandler(controller.listAssignments),
);
router.post(
  '/dashboard/menus/:id/assignments',
  auth,
  canCreate,
  validate(menuIdParamsSchema, 'params'),
  validate(createAssignmentSchema),
  asyncHandler(controller.createAssignment),
);
router.delete(
  '/dashboard/menus/:id/assignments/:assignmentId',
  auth,
  canDelete,
  validate(assignmentIdParamsSchema, 'params'),
  asyncHandler(controller.deleteAssignment),
);

export default router;
