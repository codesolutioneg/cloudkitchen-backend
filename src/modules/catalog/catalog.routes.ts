import { Router } from 'express';
import { asyncHandler } from '../../core/middleware/asyncHandler';
import { validate } from '../../core/middleware/validate';
import {
  companyAuthMiddleware,
  dashboardAuthMiddleware,
} from '../../core/middleware/companyAuthMiddleware';
import { requirePagePermission } from '../../core/middleware/requirePagePermission';
import {
  addProductTagSchema,
  assignCompanyPricingListSchema,
  availabilityIdParamsSchema,
  createAvailabilitySchema,
  createCategorySchema,
  createOptionGroupSchema,
  createPriceSchema,
  createPricingListSchema,
  createProductSchema,
  createVariantSchema,
  groupIdParamsSchema,
  idParamsSchema,
  listProductsQuerySchema,
  productLangParamsSchema,
  productTagParamsSchema,
  mediaIdParamsSchema,
  setProductImageUrlSchema,
  updateAvailabilitySchema,
  updateCategorySchema,
  updateOptionGroupSchema,
  updateProductSchema,
  updateVariantSchema,
  upsertTranslationSchema,
  variantIdParamsSchema,
} from './catalog.schemas';
import * as controller from './catalog.controller';
import { uploadImageMiddleware } from '../../core/middleware/uploadImage';

const router = Router();
const dashAuth = dashboardAuthMiddleware;
const canViewCatalog = requirePagePermission('/dashboard/catalog', 'view');
const canCreateCatalog = requirePagePermission('/dashboard/catalog', 'create');
const canEditCatalog = requirePagePermission('/dashboard/catalog', 'edit');
const canDeleteCatalog = requirePagePermission('/dashboard/catalog', 'delete');

// Company catalog
router.get(
  '/company/catalog/menu',
  companyAuthMiddleware,
  asyncHandler(controller.getCompanyCatalogMenu),
);

// Categories
router.get(
  '/dashboard/catalog/categories',
  dashAuth,
  canViewCatalog,
  asyncHandler(controller.listCategories),
);
router.post(
  '/dashboard/catalog/categories',
  dashAuth,
  canCreateCatalog,
  validate(createCategorySchema),
  asyncHandler(controller.createCategory),
);
router.patch(
  '/dashboard/catalog/categories/:id',
  dashAuth,
  canEditCatalog,
  validate(idParamsSchema, 'params'),
  validate(updateCategorySchema),
  asyncHandler(controller.updateCategory),
);
router.delete(
  '/dashboard/catalog/categories/:id',
  dashAuth,
  canDeleteCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteCategory),
);

// Products
router.get(
  '/dashboard/catalog/products',
  dashAuth,
  canViewCatalog,
  validate(listProductsQuerySchema, 'query'),
  asyncHandler(controller.listProducts),
);
router.get(
  '/dashboard/catalog/products/:id',
  dashAuth,
  canViewCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.getProduct),
);
router.post(
  '/dashboard/catalog/products',
  dashAuth,
  canCreateCatalog,
  validate(createProductSchema),
  asyncHandler(controller.createProduct),
);
router.patch(
  '/dashboard/catalog/products/:id',
  dashAuth,
  canEditCatalog,
  validate(idParamsSchema, 'params'),
  validate(updateProductSchema),
  asyncHandler(controller.updateProduct),
);
router.delete(
  '/dashboard/catalog/products/:id',
  dashAuth,
  canDeleteCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.deleteProduct),
);

router.put(
  '/dashboard/catalog/products/:id/translations/:lang',
  dashAuth,
  canEditCatalog,
  validate(productLangParamsSchema, 'params'),
  validate(upsertTranslationSchema),
  asyncHandler(controller.upsertProductTranslation),
);

router.get(
  '/dashboard/catalog/products/:id/variants',
  dashAuth,
  canViewCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listVariants),
);
router.post(
  '/dashboard/catalog/products/:id/variants',
  dashAuth,
  canCreateCatalog,
  validate(idParamsSchema, 'params'),
  validate(createVariantSchema),
  asyncHandler(controller.createVariant),
);
router.patch(
  '/dashboard/catalog/products/:id/variants/:variantId',
  dashAuth,
  canEditCatalog,
  validate(variantIdParamsSchema, 'params'),
  validate(updateVariantSchema),
  asyncHandler(controller.updateVariant),
);

router.get(
  '/dashboard/catalog/products/:id/option-groups',
  dashAuth,
  canViewCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listOptionGroups),
);
router.post(
  '/dashboard/catalog/products/:id/option-groups',
  dashAuth,
  canCreateCatalog,
  validate(idParamsSchema, 'params'),
  validate(createOptionGroupSchema),
  asyncHandler(controller.createOptionGroup),
);
router.patch(
  '/dashboard/catalog/products/:id/option-groups/:groupId',
  dashAuth,
  canEditCatalog,
  validate(groupIdParamsSchema, 'params'),
  validate(updateOptionGroupSchema),
  asyncHandler(controller.updateOptionGroup),
);

router.get(
  '/dashboard/catalog/products/:id/availability',
  dashAuth,
  canViewCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listAvailability),
);
router.post(
  '/dashboard/catalog/products/:id/availability',
  dashAuth,
  canCreateCatalog,
  validate(idParamsSchema, 'params'),
  validate(createAvailabilitySchema),
  asyncHandler(controller.createAvailability),
);
router.patch(
  '/dashboard/catalog/products/:id/availability/:availabilityId',
  dashAuth,
  canEditCatalog,
  validate(availabilityIdParamsSchema, 'params'),
  validate(updateAvailabilitySchema),
  asyncHandler(controller.updateAvailability),
);
router.delete(
  '/dashboard/catalog/products/:id/availability/:availabilityId',
  dashAuth,
  canDeleteCatalog,
  validate(availabilityIdParamsSchema, 'params'),
  asyncHandler(controller.deleteAvailability),
);

router.get(
  '/dashboard/catalog/products/:id/tags',
  dashAuth,
  canViewCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listProductTags),
);
router.post(
  '/dashboard/catalog/products/:id/tags',
  dashAuth,
  canEditCatalog,
  validate(idParamsSchema, 'params'),
  validate(addProductTagSchema),
  asyncHandler(controller.addProductTag),
);
router.delete(
  '/dashboard/catalog/products/:id/tags/:tagId',
  dashAuth,
  canEditCatalog,
  validate(productTagParamsSchema, 'params'),
  asyncHandler(controller.removeProductTag),
);

router.get(
  '/dashboard/catalog/products/:id/media',
  dashAuth,
  canViewCatalog,
  validate(idParamsSchema, 'params'),
  asyncHandler(controller.listProductMedia),
);
router.post(
  '/dashboard/catalog/products/:id/image',
  dashAuth,
  canEditCatalog,
  validate(idParamsSchema, 'params'),
  uploadImageMiddleware.single('file'),
  asyncHandler(controller.uploadProductImage),
);
router.put(
  '/dashboard/catalog/products/:id/image',
  dashAuth,
  canEditCatalog,
  validate(idParamsSchema, 'params'),
  validate(setProductImageUrlSchema),
  asyncHandler(controller.setProductImageUrl),
);
router.delete(
  '/dashboard/catalog/products/:id/media/:mediaId',
  dashAuth,
  canEditCatalog,
  validate(mediaIdParamsSchema, 'params'),
  asyncHandler(controller.deleteProductMedia),
);

router.get(
  '/dashboard/catalog/pricing-lists',
  dashAuth,
  canViewCatalog,
  asyncHandler(controller.listPricingLists),
);
router.post(
  '/dashboard/catalog/pricing-lists',
  dashAuth,
  canCreateCatalog,
  validate(createPricingListSchema),
  asyncHandler(controller.createPricingList),
);
router.post(
  '/dashboard/catalog/prices',
  dashAuth,
  canCreateCatalog,
  validate(createPriceSchema),
  asyncHandler(controller.createPrice),
);
router.post(
  '/dashboard/catalog/company-assignment',
  dashAuth,
  canEditCatalog,
  validate(assignCompanyPricingListSchema),
  asyncHandler(controller.assignCompanyPricingList),
);

export default router;
