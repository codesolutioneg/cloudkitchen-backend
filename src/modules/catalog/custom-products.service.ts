import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../prisma/client';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { getRequestActor } from '../../core/middleware/requestContext';

export const CUSTOM_CATEGORY_SLUG = 'company-custom-orders';
export const CUSTOM_SECTION_CODE = 'company-custom-orders';

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

export async function getOrCreateCustomCategory() {
  const existing = await prisma.category.findFirst({
    where: { slug: CUSTOM_CATEGORY_SLUG, is_deleted: false },
  });
  if (existing) return existing;

  return prisma.category.create({
    data: {
      name: 'Custom Orders',
      name_ar: 'طلبات مخصصة',
      slug: CUSTOM_CATEGORY_SLUG,
      is_active: true,
      sort_order: 9999,
      created_by_type: 'system',
    },
  });
}

function serializeCustomProduct(product: {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price: Decimal | null;
  currency: string;
  approval_status: string;
  rejection_reason: string | null;
  is_active: boolean;
  company_id: string | null;
  created_at: Date;
  translations?: Array<{ language_code: string; name: string; description: string | null }>;
}) {
  const nameAr = product.translations?.find((t) => t.language_code === 'ar')?.name ?? null;
  return {
    id: product.id,
    name: product.name,
    nameAr,
    description: product.description,
    imageUrl: product.image_url,
    basePrice: product.base_price?.toString() ?? null,
    currency: product.currency,
    approvalStatus: product.approval_status,
    rejectionReason: product.rejection_reason,
    isActive: product.is_active,
    companyId: product.company_id,
    orderable: product.approval_status === 'approved' && product.is_active && product.base_price != null,
    createdAt: product.created_at.toISOString(),
  };
}

export async function createCompanyCustomProduct(input: {
  name?: string;
  nameAr?: string;
  description?: string;
  specifications?: string;
  baseProductId?: string;
  modifierSelections?: Array<{
    groupId: string;
    groupName?: string;
    optionIds: string[];
    optionNames?: string[];
  }>;
}) {
  const actor = getCompanyActorOrThrow();

  const company = await prisma.company.findFirst({
    where: { id: actor.companyId, is_deleted: false },
  });
  if (!company || company.approval_status !== 'approved') {
    throw new ForbiddenError('Only approved companies can request custom products');
  }

  let baseProduct: {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    translations?: Array<{ language_code: string; name: string }>;
    option_groups: Array<{
      id: string;
      name: string;
      selection_type: string;
      min_select: number;
      max_select: number;
      is_required: boolean;
      options: Array<{ id: string; name: string; is_active: boolean }>;
    }>;
  } | null = null;

  if (input.baseProductId) {
    baseProduct = await prisma.product.findFirst({
      where: { id: input.baseProductId, is_deleted: false, is_active: true },
      include: {
        translations: true,
        option_groups: { include: { options: { where: { is_active: true } } } },
      },
    });
    if (!baseProduct) {
      throw new BadRequestError('Base product not found');
    }
  }

  if (input.modifierSelections?.length) {
    if (!baseProduct) {
      throw new BadRequestError('Modifier selections require a base product');
    }
    for (const sel of input.modifierSelections) {
      const group = baseProduct.option_groups.find((g) => g.id === sel.groupId);
      if (!group) {
        throw new BadRequestError(`Modifier group not found: ${sel.groupName ?? sel.groupId}`);
      }
      const validIds = new Set(group.options.map((o) => o.id));
      for (const optionId of sel.optionIds) {
        if (!validIds.has(optionId)) {
          throw new BadRequestError(`Invalid option for modifier group "${group.name}"`);
        }
      }
      const max = group.selection_type === 'multiple' ? group.max_select : 1;
      if (sel.optionIds.length < group.min_select || sel.optionIds.length > max) {
        throw new BadRequestError(`Select between ${group.min_select} and ${max} options for "${group.name}"`);
      }
    }
    for (const group of baseProduct.option_groups) {
      if (group.is_required) {
        const picked = input.modifierSelections.find((s) => s.groupId === group.id);
        if (!picked || picked.optionIds.length === 0) {
          throw new BadRequestError(`Required modifier missing: ${group.name}`);
        }
      }
    }
  }

  const category = await getOrCreateCustomCategory();
  const baseName = baseProduct?.name ?? input.name?.trim();
  if (!baseName) {
    throw new BadRequestError('Product name is required');
  }

  const modifierLines =
    input.modifierSelections?.map((sel) => {
      const names = sel.optionNames?.length
        ? sel.optionNames.join(', ')
        : sel.optionIds.join(', ');
      return `${sel.groupName ?? 'Modifier'}: ${names}`;
    }) ?? [];

  const specsParts = [
    baseProduct ? `Based on: ${baseProduct.name}` : null,
    ...modifierLines,
    input.specifications?.trim() || null,
  ].filter(Boolean);

  const description = [input.description, specsParts.join('\n')].filter(Boolean).join('\n\n') || null;
  const nameAr =
    input.nameAr?.trim() ||
    baseProduct?.translations?.find((t) => t.language_code === 'ar')?.name ||
    undefined;

  const product = await prisma.product.create({
    data: {
      category_id: category.id,
      company_id: actor.companyId,
      name: input.name?.trim() || `${baseName} (Custom)`,
      description,
      image_url: baseProduct?.image_url ?? null,
      base_price: null,
      currency: company.default_currency || 'EGP',
      visibility: 'restricted',
      is_active: false,
      approval_status: 'pending',
      attributes: {
        sourceProductId: input.baseProductId ?? null,
        modifierSelections: input.modifierSelections ?? [],
      },
      created_by_type: actor.type,
      created_by_id: actor.id,
      translations: nameAr
        ? {
            create: {
              language_code: 'ar',
              name: nameAr,
              description,
            },
          }
        : undefined,
    },
    include: { translations: true },
  });

  return serializeCustomProduct(product);
}

export async function listCompanyCustomProducts(query: { status?: string } = {}) {
  const actor = getCompanyActorOrThrow();
  const where: {
    company_id: string;
    is_deleted: false;
    approval_status?: string;
  } = {
    company_id: actor.companyId,
    is_deleted: false,
  };
  if (query.status) where.approval_status = query.status;

  const products = await prisma.product.findMany({
    where,
    include: { translations: true },
    orderBy: { created_at: 'desc' },
  });

  return products.map(serializeCustomProduct);
}

export async function listDashboardCustomProducts(query: { status?: string; companyId?: string } = {}) {
  getDashboardActorOrThrow();

  const products = await prisma.product.findMany({
    where: {
      company_id: { not: null },
      is_deleted: false,
      ...(query.status ? { approval_status: query.status } : {}),
      ...(query.companyId ? { company_id: query.companyId } : {}),
    },
    include: {
      translations: true,
      company: { select: { id: true, legal_name: true, trade_name: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return products.map((p) => ({
    ...serializeCustomProduct(p),
    company: {
      id: p.company!.id,
      legalName: p.company!.legal_name,
      tradeName: p.company!.trade_name,
    },
  }));
}

export async function approveCustomProduct(
  productId: string,
  input: { basePrice: number; currency?: string; comment?: string },
) {
  const actor = getDashboardActorOrThrow();

  const product = await prisma.product.findFirst({
    where: { id: productId, company_id: { not: null }, is_deleted: false },
  });
  if (!product) throw new NotFoundError('Custom product not found');
  if (product.approval_status !== 'pending') {
    throw new BadRequestError('Only pending custom products can be approved');
  }
  if (input.basePrice <= 0) {
    throw new BadRequestError('Price must be greater than zero');
  }

  const currency = input.currency ?? product.currency ?? 'EGP';

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      approval_status: 'approved',
      base_price: new Decimal(input.basePrice),
      currency,
      is_active: true,
      rejection_reason: null,
      approved_by: actor.id,
      approved_at: new Date(),
      updated_by_type: actor.type,
      updated_by_id: actor.id,
    },
    include: { translations: true },
  });

  return serializeCustomProduct(updated);
}

export async function rejectCustomProduct(productId: string, reason?: string) {
  const actor = getDashboardActorOrThrow();
  const trimmed = reason?.trim();
  if (!trimmed || trimmed.length < 3) {
    throw new BadRequestError('Rejection reason is required');
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, company_id: { not: null }, is_deleted: false },
  });
  if (!product) throw new NotFoundError('Custom product not found');
  if (product.approval_status !== 'pending') {
    throw new BadRequestError('Only pending custom products can be rejected');
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      approval_status: 'rejected',
      rejection_reason: trimmed,
      is_active: false,
      updated_by_type: actor.type,
      updated_by_id: actor.id,
    },
    include: { translations: true },
  });

  return serializeCustomProduct(updated);
}

export async function loadCompanyCustomMenuProducts(companyId: string) {
  const products = await prisma.product.findMany({
    where: {
      company_id: companyId,
      is_deleted: false,
      approval_status: { in: ['pending', 'approved'] },
    },
    include: {
      translations: true,
      variants: { where: { is_active: true } },
      option_groups: {
        include: { options: { where: { is_active: true }, orderBy: { sort_order: 'asc' } } },
      },
      media: { where: { is_primary: true }, take: 1 },
    },
    orderBy: { created_at: 'desc' },
  });

  return products;
}

export async function isOrderableCustomProduct(productId: string, companyId: string) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      company_id: companyId,
      approval_status: 'approved',
      is_active: true,
      is_deleted: false,
      base_price: { not: null },
    },
  });
  return Boolean(product);
}
