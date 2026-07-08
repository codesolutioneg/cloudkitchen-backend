import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { ForbiddenError, NotFoundError, ConflictError } from '../../core/errors/AppError';
import { isPrismaUniqueViolation } from '../../core/utils/prismaErrors';
import { getRequestActor } from '../../core/middleware/requestContext';
import { menuResolver } from '../../engines/menuResolver';
import { resolveTranslation } from '../../engines/localizationResolver';
import { toPublicUploadUrl } from './catalog.image.service';

function serializeCategory(category: {
  id: string;
  parent_category_id: string | null;
  name: string;
  name_ar?: string | null;
  slug: string;
  image_url?: string | null;
  sort_order: number;
  is_active: boolean;
}) {
  return {
    id: category.id,
    parentCategoryId: category.parent_category_id,
    name: category.name,
    nameAr: category.name_ar ?? null,
    slug: category.slug,
    imageUrl: category.image_url ?? null,
    sortOrder: category.sort_order,
    isActive: category.is_active,
  };
}

function serializeProduct(product: {
  id: string;
  category_id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  image_url?: string | null;
  prep_time_mins?: number | null;
  base_price: Prisma.Decimal;
  currency: string;
  tax_class: string | null;
  is_active: boolean;
  visibility: string;
  sort_order: number;
  erp_reference_id?: string | null;
  pos_reference_id?: string | null;
  attributes: Prisma.JsonValue;
}) {
  return {
    id: product.id,
    categoryId: product.category_id,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    description: product.description,
    imageUrl: product.image_url ? toPublicUploadUrl(product.image_url) : null,
    prepTimeMins: product.prep_time_mins ?? null,
    basePrice: product.base_price.toString(),
    currency: product.currency,
    taxClass: product.tax_class,
    isActive: product.is_active,
    visibility: product.visibility,
    sortOrder: product.sort_order,
    erpReferenceId: product.erp_reference_id ?? null,
    posReferenceId: product.pos_reference_id ?? null,
    attributes: product.attributes,
  };
}

function getCompanyActorOrThrow() {
  const actor = getRequestActor();
  if (actor?.type !== 'company_user' || !actor.companyId) {
    throw new ForbiddenError('Company authentication required');
  }
  return { ...actor, companyId: actor.companyId };
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  });
  return categories.map(serializeCategory);
}

export async function createCategory(input: {
  parentCategoryId?: string;
  name: string;
  nameAr?: string;
  slug: string;
  imageUrl?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  try {
    const category = await prisma.category.create({
      data: {
        parent_category_id: input.parentCategoryId ?? null,
        name: input.name,
        name_ar: input.nameAr ?? null,
        slug: input.slug,
        image_url: input.imageUrl ?? null,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
      },
    });
    return serializeCategory(category);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Category slug already exists');
    }
    throw err;
  }
}

export async function updateCategory(
  categoryId: string,
  input: {
    parentCategoryId?: string | null;
    name?: string;
    nameAr?: string | null;
    slug?: string;
    imageUrl?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  const existing = await prisma.category.findFirst({ where: { id: categoryId } });
  if (!existing) {
    throw new NotFoundError('Category not found');
  }
  try {
    const category = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(input.parentCategoryId !== undefined
          ? { parent_category_id: input.parentCategoryId }
          : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameAr !== undefined ? { name_ar: input.nameAr } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.imageUrl !== undefined ? { image_url: input.imageUrl } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      },
    });
    return serializeCategory(category);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Category slug already exists');
    }
    throw err;
  }
}

export async function deleteCategory(categoryId: string) {
  const existing = await prisma.category.findFirst({ where: { id: categoryId } });
  if (!existing) {
    throw new NotFoundError('Category not found');
  }
  await prisma.category.update({
    where: { id: categoryId },
    data: { is_deleted: true, deleted_at: new Date() },
  });
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function listProducts(query?: { categoryId?: string; page?: number; pageSize?: number }) {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 50;
  const where: Prisma.ProductWhereInput = {};
  if (query?.categoryId) {
    where.category_id = query.categoryId;
  }

  const [items, totalItems] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map(serializeProduct),
    pagination: { page, pageSize, totalItems },
  };
}

export async function getProduct(productId: string, languageCode?: string) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const serialized = serializeProduct(product);

  if (languageCode) {
    const translatedName = await resolveTranslation('product', productId, 'name', languageCode);
    const translatedDescription = await resolveTranslation(
      'product',
      productId,
      'description',
      languageCode,
    );
    if (translatedName) {
      serialized.name = translatedName;
    }
    if (translatedDescription) {
      serialized.description = translatedDescription;
    }
  }

  return serialized;
}

export async function createProduct(input: {
  categoryId: string;
  sku?: string;
  barcode?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  prepTimeMins?: number;
  basePrice: string;
  currency: string;
  taxClass?: string;
  isActive?: boolean;
  visibility?: 'public' | 'restricted';
  sortOrder?: number;
  erpReferenceId?: string;
  posReferenceId?: string;
  attributes?: Record<string, unknown>;
}) {
  try {
    const product = await prisma.product.create({
      data: {
        category_id: input.categoryId,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        name: input.name,
        description: input.description ?? null,
        image_url: input.imageUrl ?? null,
        prep_time_mins: input.prepTimeMins ?? 25,
        base_price: input.basePrice,
        currency: input.currency,
        tax_class: input.taxClass ?? null,
        is_active: input.isActive ?? true,
        visibility: input.visibility ?? 'public',
        sort_order: input.sortOrder ?? 0,
        erp_reference_id: input.erpReferenceId ?? null,
        pos_reference_id: input.posReferenceId ?? null,
        attributes: input.attributes ?? Prisma.JsonNull,
      },
    });
    if (input.imageUrl) {
      await prisma.productMedia.create({
        data: {
          product_id: product.id,
          media_type: 'image',
          url: input.imageUrl,
          is_primary: true,
          sort_order: 0,
        },
      });
    }
    return serializeProduct(product);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Product SKU already exists');
    }
    throw err;
  }
}

export async function updateProduct(
  productId: string,
  input: {
    categoryId?: string;
    sku?: string | null;
    barcode?: string | null;
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    prepTimeMins?: number | null;
    basePrice?: string;
    currency?: string;
    taxClass?: string | null;
    isActive?: boolean;
    visibility?: 'public' | 'restricted';
    sortOrder?: number;
    attributes?: Record<string, unknown> | null;
  },
) {
  const existing = await prisma.product.findFirst({ where: { id: productId } });
  if (!existing) {
    throw new NotFoundError('Product not found');
  }
  try {
    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.imageUrl !== undefined ? { image_url: input.imageUrl } : {}),
        ...(input.prepTimeMins !== undefined ? { prep_time_mins: input.prepTimeMins } : {}),
        ...(input.basePrice !== undefined ? { base_price: input.basePrice } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.taxClass !== undefined ? { tax_class: input.taxClass } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
        ...(input.attributes !== undefined
          ? { attributes: input.attributes === null ? Prisma.JsonNull : input.attributes }
          : {}),
      },
    });
    return serializeProduct(product);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new ConflictError('Product SKU already exists');
    }
    throw err;
  }
}

export async function deleteProduct(productId: string) {
  const existing = await prisma.product.findFirst({ where: { id: productId } });
  if (!existing) {
    throw new NotFoundError('Product not found');
  }
  await prisma.product.update({
    where: { id: productId },
    data: { is_deleted: true, deleted_at: new Date() },
  });
}

// ── Translations ──────────────────────────────────────────────────────────────

export async function upsertProductTranslation(
  productId: string,
  languageCode: string,
  input: { name: string; description?: string },
) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const translation = await prisma.productTranslation.upsert({
    where: {
      product_id_language_code: { product_id: productId, language_code: languageCode },
    },
    create: {
      product_id: productId,
      language_code: languageCode,
      name: input.name,
      description: input.description ?? null,
    },
    update: {
      name: input.name,
      description: input.description ?? null,
    },
  });

  return {
    id: translation.id,
    productId: translation.product_id,
    languageCode: translation.language_code,
    name: translation.name,
    description: translation.description,
  };
}

// ── Variants ──────────────────────────────────────────────────────────────────

export async function listVariants(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const variants = await prisma.productVariant.findMany({
    where: { product_id: productId },
    orderBy: { variant_name: 'asc' },
  });

  return variants.map((variant) => ({
    id: variant.id,
    productId: variant.product_id,
    name: variant.variant_name,
    variantName: variant.variant_name,
    sku: variant.sku,
    priceDelta: variant.price_adjustment.toString(),
    priceAdjustment: variant.price_adjustment.toString(),
    isDefault: variant.is_default,
    isActive: variant.is_active,
  }));
}

export async function createVariant(
  productId: string,
  input: {
    variantName: string;
    sku?: string;
    priceAdjustment?: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const variant = await prisma.productVariant.create({
    data: {
      product_id: productId,
      variant_name: input.variantName,
      sku: input.sku ?? null,
      price_adjustment: input.priceAdjustment ?? '0',
      is_default: input.isDefault ?? false,
      is_active: input.isActive ?? true,
    },
  });

  return {
    id: variant.id,
    productId: variant.product_id,
    variantName: variant.variant_name,
    sku: variant.sku,
    priceAdjustment: variant.price_adjustment.toString(),
    isDefault: variant.is_default,
    isActive: variant.is_active,
  };
}

export async function updateVariant(
  productId: string,
  variantId: string,
  input: {
    variantName?: string;
    sku?: string | null;
    priceAdjustment?: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
) {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, product_id: productId },
  });
  if (!variant) {
    throw new NotFoundError('Variant not found');
  }

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: {
      ...(input.variantName !== undefined ? { variant_name: input.variantName } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.priceAdjustment !== undefined ? { price_adjustment: input.priceAdjustment } : {}),
      ...(input.isDefault !== undefined ? { is_default: input.isDefault } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    },
  });

  return {
    id: updated.id,
    productId: updated.product_id,
    variantName: updated.variant_name,
    sku: updated.sku,
    priceAdjustment: updated.price_adjustment.toString(),
    isDefault: updated.is_default,
    isActive: updated.is_active,
  };
}

// ── Option groups ─────────────────────────────────────────────────────────────

export async function listOptionGroups(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const groups = await prisma.productOptionGroup.findMany({
    where: { product_id: productId },
    include: { options: { orderBy: { sort_order: 'asc' } } },
    orderBy: { name: 'asc' },
  });

  return groups.map(serializeOptionGroup);
}

export async function createOptionGroup(
  productId: string,
  input: {
    name: string;
    selectionType?: 'single' | 'multiple';
    minSelect?: number;
    maxSelect?: number;
    isRequired?: boolean;
    options?: Array<{
      name: string;
      priceAdjustment?: string;
      isActive?: boolean;
      sortOrder?: number;
    }>;
  },
) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const group = await prisma.productOptionGroup.create({
    data: {
      product_id: productId,
      name: input.name,
      selection_type: input.selectionType ?? 'single',
      min_select: input.minSelect ?? 0,
      max_select: input.maxSelect ?? 1,
      is_required: input.isRequired ?? false,
      options: input.options
        ? {
            create: input.options.map((o, idx) => ({
              name: o.name,
              price_adjustment: o.priceAdjustment ?? '0',
              is_active: o.isActive ?? true,
              sort_order: o.sortOrder ?? idx,
            })),
          }
        : undefined,
    },
    include: { options: true },
  });

  return serializeOptionGroup(group);
}

export async function updateOptionGroup(
  productId: string,
  groupId: string,
  input: {
    name?: string;
    selectionType?: 'single' | 'multiple';
    minSelect?: number;
    maxSelect?: number;
    isRequired?: boolean;
  },
) {
  const group = await prisma.productOptionGroup.findFirst({
    where: { id: groupId, product_id: productId },
  });
  if (!group) {
    throw new NotFoundError('Option group not found');
  }

  const updated = await prisma.productOptionGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.selectionType !== undefined ? { selection_type: input.selectionType } : {}),
      ...(input.minSelect !== undefined ? { min_select: input.minSelect } : {}),
      ...(input.maxSelect !== undefined ? { max_select: input.maxSelect } : {}),
      ...(input.isRequired !== undefined ? { is_required: input.isRequired } : {}),
    },
    include: { options: true },
  });

  return serializeOptionGroup(updated);
}

function serializeOptionGroup(group: {
  id: string;
  product_id: string;
  name: string;
  selection_type: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  options: Array<{
    id: string;
    name: string;
    price_adjustment: Prisma.Decimal;
    is_active: boolean;
    sort_order: number;
  }>;
}) {
  return {
    id: group.id,
    productId: group.product_id,
    name: group.name,
    selectionType: group.selection_type,
    minSelect: group.min_select,
    maxSelect: group.max_select,
    isRequired: group.is_required,
    options: group.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceAdjustment: o.price_adjustment.toString(),
      isActive: o.is_active,
      sortOrder: o.sort_order,
    })),
  };
}

// ── Availability ──────────────────────────────────────────────────────────────

export async function listAvailability(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const rows = await prisma.productAvailability.findMany({
    where: { product_id: productId },
    orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
  });

  return rows.map(serializeAvailability);
}

export async function createAvailability(
  productId: string,
  input: {
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    availableFrom?: string;
    availableTo?: string;
  },
) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const row = await prisma.productAvailability.create({
    data: {
      product_id: productId,
      day_of_week: input.dayOfWeek ?? null,
      start_time: input.startTime ? new Date(`1970-01-01T${input.startTime}`) : null,
      end_time: input.endTime ? new Date(`1970-01-01T${input.endTime}`) : null,
      available_from: input.availableFrom ? new Date(input.availableFrom) : null,
      available_to: input.availableTo ? new Date(input.availableTo) : null,
    },
  });

  return serializeAvailability(row);
}

export async function updateAvailability(
  productId: string,
  availabilityId: string,
  input: {
    dayOfWeek?: number | null;
    startTime?: string | null;
    endTime?: string | null;
    availableFrom?: string | null;
    availableTo?: string | null;
  },
) {
  const row = await prisma.productAvailability.findFirst({
    where: { id: availabilityId, product_id: productId },
  });
  if (!row) {
    throw new NotFoundError('Availability rule not found');
  }

  const updated = await prisma.productAvailability.update({
    where: { id: availabilityId },
    data: {
      ...(input.dayOfWeek !== undefined ? { day_of_week: input.dayOfWeek } : {}),
      ...(input.startTime !== undefined
        ? {
            start_time: input.startTime
              ? new Date(`1970-01-01T${input.startTime}`)
              : null,
          }
        : {}),
      ...(input.endTime !== undefined
        ? {
            end_time: input.endTime ? new Date(`1970-01-01T${input.endTime}`) : null,
          }
        : {}),
      ...(input.availableFrom !== undefined
        ? { available_from: input.availableFrom ? new Date(input.availableFrom) : null }
        : {}),
      ...(input.availableTo !== undefined
        ? { available_to: input.availableTo ? new Date(input.availableTo) : null }
        : {}),
    },
  });

  return serializeAvailability(updated);
}

export async function deleteAvailability(productId: string, availabilityId: string) {
  const row = await prisma.productAvailability.findFirst({
    where: { id: availabilityId, product_id: productId },
  });
  if (!row) {
    throw new NotFoundError('Availability rule not found');
  }
  await prisma.productAvailability.delete({ where: { id: availabilityId } });
}

function serializeAvailability(row: {
  id: string;
  product_id: string;
  day_of_week: number | null;
  start_time: Date | null;
  end_time: Date | null;
  available_from: Date | null;
  available_to: Date | null;
}) {
  return {
    id: row.id,
    productId: row.product_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time?.toISOString().slice(11, 19) ?? null,
    endTime: row.end_time?.toISOString().slice(11, 19) ?? null,
    availableFrom: row.available_from?.toISOString().slice(0, 10) ?? null,
    availableTo: row.available_to?.toISOString().slice(0, 10) ?? null,
  };
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function listProductTags(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const rows = await prisma.productTag.findMany({
    where: { product_id: productId },
    include: { tag: true },
    orderBy: { tag: { name: 'asc' } },
  });

  return rows.map((row) => ({
    id: row.tag_id,
    productId,
    tag: row.tag.name,
    tagName: row.tag.name,
  }));
}

export async function addProductTag(productId: string, tagName: string) {
  const product = await prisma.product.findFirst({ where: { id: productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const tag = await prisma.tag.upsert({
    where: { name: tagName },
    create: { name: tagName },
    update: {},
  });

  await prisma.productTag.upsert({
    where: { product_id_tag_id: { product_id: productId, tag_id: tag.id } },
    create: { product_id: productId, tag_id: tag.id },
    update: {},
  });

  return { id: tag.id, productId, tag: tag.name, tagName: tag.name };
}

export async function removeProductTag(productId: string, tagId: string) {
  await prisma.productTag.deleteMany({
    where: { product_id: productId, tag_id: tagId },
  });
}

// ── Pricing ───────────────────────────────────────────────────────────────────

export async function createPricingList(input: {
  name: string;
  currency: string;
  isDefault?: boolean;
}) {
  const list = await prisma.productPricingList.create({
    data: {
      name: input.name,
      currency: input.currency,
      is_default: input.isDefault ?? false,
    },
  });
  return {
    id: list.id,
    code: list.name,
    name: list.name,
    currency: list.currency,
    isDefault: list.is_default,
    isActive: true,
  };
}

export async function listPricingLists() {
  const lists = await prisma.productPricingList.findMany({ orderBy: { name: 'asc' } });
  return lists.map((l) => ({
    id: l.id,
    code: l.name,
    name: l.name,
    currency: l.currency,
    isActive: true,
    isDefault: l.is_default,
  }));
}

export async function createPrice(input: {
  pricingListId: string;
  productId: string;
  variantId?: string;
  price: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}) {
  const row = await prisma.productPrice.create({
    data: {
      pricing_list_id: input.pricingListId,
      product_id: input.productId,
      variant_id: input.variantId ?? null,
      price: input.price,
      effective_from: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
      effective_to: input.effectiveTo ? new Date(input.effectiveTo) : null,
    },
  });
  return {
    id: row.id,
    pricingListId: row.pricing_list_id,
    productId: row.product_id,
    variantId: row.variant_id,
    price: row.price.toString(),
    effectiveFrom: row.effective_from.toISOString(),
    effectiveTo: row.effective_to?.toISOString() ?? null,
  };
}

export async function assignCompanyPricingList(input: {
  companyId: string;
  pricingListId: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}) {
  const row = await prisma.companyPricingListAssignment.create({
    data: {
      company_id: input.companyId,
      pricing_list_id: input.pricingListId,
      effective_from: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
      effective_to: input.effectiveTo ? new Date(input.effectiveTo) : null,
    },
  });
  return {
    id: row.id,
    companyId: row.company_id,
    pricingListId: row.pricing_list_id,
    effectiveFrom: row.effective_from.toISOString(),
    effectiveTo: row.effective_to?.toISOString() ?? null,
  };
}

// ── Company catalog menu (§8.3, §13) ──────────────────────────────────────────

export async function getCompanyCatalogMenu() {
  const actor = getCompanyActorOrThrow();

  const user = await prisma.companyUser.findFirst({
    where: { id: actor.id, company_id: actor.companyId },
    select: { department_id: true },
  });

  const menuId = await menuResolver.resolveEffectiveMenu(
    actor.companyId,
    user?.department_id,
    actor.id,
  );

  if (!menuId) {
    return { menu: null, sections: [] };
  }

  const menu = await prisma.catalogMenu.findUnique({
    where: { id: menuId },
    include: {
      sections: {
        orderBy: { sort_order: 'asc' },
        include: {
          products: {
            orderBy: { sort_order: 'asc' },
            include: {
              product: {
                include: {
                  translations: true,
                  variants: { where: { is_active: true } },
                  option_groups: { include: { options: { where: { is_active: true }, orderBy: { sort_order: 'asc' } } } },
                  media: { where: { is_primary: true }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!menu || !menu.is_active) {
    return { menu: null, sections: [] };
  }

  const sections = await Promise.all(
    menu.sections.map(async (section) => {
      const products = (
        await Promise.all(
          section.products.map(async (cmp) => {
            const product = cmp.product;
            if (!product.is_active || product.is_deleted) {
              return null;
            }
            if (product.visibility === 'restricted' && !cmp.product_id) {
              return null;
            }

            const resolvedPrice = await menuResolver.resolveProductPrice(
              actor.companyId,
              product.id,
            );

            const nameAr =
              product.translations.find((t) => t.language_code === 'ar')?.name ?? null;

            return {
              id: product.id,
              name: product.name,
              nameAr,
              description: product.description,
              imageUrl: product.image_url ?? product.media[0]?.url ?? null,
              prepTimeMins: product.prep_time_mins,
              sku: product.sku,
              visibility: product.visibility,
              sortOrder: cmp.sort_order,
              isFeatured: cmp.is_featured,
              price: resolvedPrice.price.toString(),
              currency: resolvedPrice.currency,
              priceSource: resolvedPrice.source,
              variants: product.variants.map((v) => ({
                id: v.id,
                variantName: v.variant_name,
                priceAdjustment: v.price_adjustment.toString(),
                isDefault: v.is_default,
              })),
              modifiers: product.option_groups.map((g) => ({
                id: g.id,
                name: g.name,
                displayType: g.selection_type === 'multiple' ? 'checkbox' : 'radio',
                required: g.is_required,
                minSelect: g.min_select,
                maxSelect: g.max_select,
                options: g.options.map((o) => ({
                  id: o.id,
                  name: o.name,
                  priceExtra: o.price_adjustment.toString(),
                })),
              })),
              translations: product.translations.map((t) => ({
                languageCode: t.language_code,
                name: t.name,
                description: t.description,
              })),
            };
          }),
        )
      ).filter((p): p is NonNullable<typeof p> => p !== null);

      return {
        id: section.id,
        name: section.name,
        sortOrder: section.sort_order,
        products,
      };
    }),
  );

  return {
    menu: {
      id: menu.id,
      name: menu.name,
      menuType: menu.menu_type,
      description: menu.description,
    },
    sections,
  };
}
