import { prisma } from '../../prisma/client';
import { NotFoundError } from '../../core/errors/AppError';

function serializeMenu(menu: {
  id: string;
  name: string;
  menu_type: string;
  description: string | null;
  is_active: boolean;
}) {
  return {
    id: menu.id,
    name: menu.name,
    menuType: menu.menu_type,
    description: menu.description,
    isActive: menu.is_active,
  };
}

function serializeSection(section: {
  id: string;
  catalog_menu_id: string;
  name: string;
  sort_order: number;
}) {
  return {
    id: section.id,
    catalogMenuId: section.catalog_menu_id,
    name: section.name,
    sortOrder: section.sort_order,
  };
}

function serializeAssignment(assignment: {
  id: string;
  catalog_menu_id: string;
  scope_type: string;
  scope_id: string;
  priority: number;
  effective_from: Date;
  effective_to: Date | null;
  is_active: boolean;
}) {
  return {
    id: assignment.id,
    catalogMenuId: assignment.catalog_menu_id,
    scopeType: assignment.scope_type,
    scopeId: assignment.scope_id,
    priority: assignment.priority,
    effectiveFrom: assignment.effective_from.toISOString(),
    effectiveTo: assignment.effective_to?.toISOString() ?? null,
    isActive: assignment.is_active,
  };
}

// ── Menus ─────────────────────────────────────────────────────────────────────

export async function listMenus() {
  const menus = await prisma.catalogMenu.findMany({ orderBy: { name: 'asc' } });
  return menus.map(serializeMenu);
}

export async function getMenu(menuId: string) {
  const menu = await prisma.catalogMenu.findUnique({
    where: { id: menuId },
    include: {
      sections: { orderBy: { sort_order: 'asc' } },
      assignments: { orderBy: { priority: 'desc' } },
    },
  });
  if (!menu) {
    throw new NotFoundError('Menu not found');
  }
  return {
    ...serializeMenu(menu),
    sections: menu.sections.map(serializeSection),
    assignments: menu.assignments.map(serializeAssignment),
  };
}

export async function createMenu(input: {
  name: string;
  menuType: string;
  description?: string;
  isActive?: boolean;
}) {
  const menu = await prisma.catalogMenu.create({
    data: {
      name: input.name,
      menu_type: input.menuType,
      description: input.description ?? null,
      is_active: input.isActive ?? true,
    },
  });
  return serializeMenu(menu);
}

export async function updateMenu(
  menuId: string,
  input: {
    name?: string;
    menuType?: string;
    description?: string | null;
    isActive?: boolean;
  },
) {
  const existing = await prisma.catalogMenu.findUnique({ where: { id: menuId } });
  if (!existing) {
    throw new NotFoundError('Menu not found');
  }
  const menu = await prisma.catalogMenu.update({
    where: { id: menuId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.menuType !== undefined ? { menu_type: input.menuType } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    },
  });
  return serializeMenu(menu);
}

export async function deleteMenu(menuId: string) {
  const existing = await prisma.catalogMenu.findUnique({ where: { id: menuId } });
  if (!existing) {
    throw new NotFoundError('Menu not found');
  }
  await prisma.catalogMenu.update({
    where: { id: menuId },
    data: { is_active: false },
  });
}

// ── Sections ──────────────────────────────────────────────────────────────────

export async function listSections(menuId: string) {
  const menu = await prisma.catalogMenu.findUnique({ where: { id: menuId } });
  if (!menu) {
    throw new NotFoundError('Menu not found');
  }
  const sections = await prisma.catalogMenuSection.findMany({
    where: { catalog_menu_id: menuId },
    orderBy: { sort_order: 'asc' },
  });
  return sections.map(serializeSection);
}

export async function createSection(
  menuId: string,
  input: { name: string; sortOrder?: number },
) {
  const menu = await prisma.catalogMenu.findUnique({ where: { id: menuId } });
  if (!menu) {
    throw new NotFoundError('Menu not found');
  }
  const section = await prisma.catalogMenuSection.create({
    data: {
      catalog_menu_id: menuId,
      name: input.name,
      sort_order: input.sortOrder ?? 0,
    },
  });
  return serializeSection(section);
}

export async function updateSection(
  menuId: string,
  sectionId: string,
  input: { name?: string; sortOrder?: number },
) {
  const section = await prisma.catalogMenuSection.findFirst({
    where: { id: sectionId, catalog_menu_id: menuId },
  });
  if (!section) {
    throw new NotFoundError('Section not found');
  }
  const updated = await prisma.catalogMenuSection.update({
    where: { id: sectionId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
    },
  });
  return serializeSection(updated);
}

export async function deleteSection(menuId: string, sectionId: string) {
  const section = await prisma.catalogMenuSection.findFirst({
    where: { id: sectionId, catalog_menu_id: menuId },
  });
  if (!section) {
    throw new NotFoundError('Section not found');
  }
  await prisma.catalogMenuSection.delete({ where: { id: sectionId } });
}

// ── Section products ──────────────────────────────────────────────────────────

export async function addProductToSection(
  menuId: string,
  sectionId: string,
  input: { productId: string; sortOrder?: number; isFeatured?: boolean },
) {
  const section = await prisma.catalogMenuSection.findFirst({
    where: { id: sectionId, catalog_menu_id: menuId },
  });
  if (!section) {
    throw new NotFoundError('Section not found');
  }

  const product = await prisma.product.findFirst({ where: { id: input.productId } });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const row = await prisma.catalogMenuProduct.upsert({
    where: {
      catalog_menu_section_id_product_id: {
        catalog_menu_section_id: sectionId,
        product_id: input.productId,
      },
    },
    create: {
      catalog_menu_section_id: sectionId,
      product_id: input.productId,
      sort_order: input.sortOrder ?? 0,
      is_featured: input.isFeatured ?? false,
    },
    update: {
      sort_order: input.sortOrder ?? 0,
      is_featured: input.isFeatured ?? false,
    },
  });

  return {
    sectionId: row.catalog_menu_section_id,
    productId: row.product_id,
    sortOrder: row.sort_order,
    isFeatured: row.is_featured,
  };
}

export async function removeProductFromSection(
  menuId: string,
  sectionId: string,
  productId: string,
) {
  const section = await prisma.catalogMenuSection.findFirst({
    where: { id: sectionId, catalog_menu_id: menuId },
  });
  if (!section) {
    throw new NotFoundError('Section not found');
  }
  await prisma.catalogMenuProduct.deleteMany({
    where: { catalog_menu_section_id: sectionId, product_id: productId },
  });
}

export async function listSectionProducts(menuId: string, sectionId: string) {
  const section = await prisma.catalogMenuSection.findFirst({
    where: { id: sectionId, catalog_menu_id: menuId },
    include: {
      products: {
        orderBy: { sort_order: 'asc' },
        include: { product: { select: { id: true, name: true, sku: true, visibility: true } } },
      },
    },
  });
  if (!section) {
    throw new NotFoundError('Section not found');
  }
  return section.products.map((p) => ({
    productId: p.product_id,
    sortOrder: p.sort_order,
    isFeatured: p.is_featured,
    product: p.product,
  }));
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function createAssignment(
  menuId: string,
  input: {
    scopeType: 'company' | 'department' | 'user' | 'campaign';
    scopeId: string;
    priority?: number;
    effectiveFrom?: string;
    effectiveTo?: string;
    isActive?: boolean;
  },
) {
  const menu = await prisma.catalogMenu.findUnique({ where: { id: menuId } });
  if (!menu) {
    throw new NotFoundError('Menu not found');
  }

  const assignment = await prisma.menuAssignment.create({
    data: {
      catalog_menu_id: menuId,
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      priority: input.priority ?? 0,
      effective_from: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
      effective_to: input.effectiveTo ? new Date(input.effectiveTo) : null,
      is_active: input.isActive ?? true,
    },
  });
  return serializeAssignment(assignment);
}

export async function listAssignments(menuId: string) {
  const menu = await prisma.catalogMenu.findUnique({ where: { id: menuId } });
  if (!menu) {
    throw new NotFoundError('Menu not found');
  }
  const assignments = await prisma.menuAssignment.findMany({
    where: { catalog_menu_id: menuId },
    orderBy: [{ priority: 'desc' }, { effective_from: 'desc' }],
  });
  return assignments.map(serializeAssignment);
}

export async function deleteAssignment(menuId: string, assignmentId: string) {
  const assignment = await prisma.menuAssignment.findFirst({
    where: { id: assignmentId, catalog_menu_id: menuId },
  });
  if (!assignment) {
    throw new NotFoundError('Assignment not found');
  }
  await prisma.menuAssignment.update({
    where: { id: assignmentId },
    data: { is_active: false },
  });
}
