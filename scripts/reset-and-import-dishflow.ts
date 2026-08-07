/**
 * Reset Cloud Kitchen catalog (menus, platform products, categories) then import Balkans menu from Dishflow.
 *
 * Dishflow DB is read-only. Only modifies /root/cloudkitchen database.
 *
 * Run:
 *   DISHFLOW_DATABASE_URL='postgresql://...' npx tsx scripts/reset-and-import-dishflow.ts
 */
import { Pool } from 'pg';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma/client';
import { CUSTOM_CATEGORY_SLUG } from '../src/modules/catalog/custom-products.service';

const DISHFLOW_URL =
  process.env.DISHFLOW_DATABASE_URL ??
  'postgresql://dishflow:a711e57e48b49bde73844c26649f920d@localhost:5432/dishflow';

const RESTAURANT_ID = process.env.DISHFLOW_RESTAURANT_ID ?? 'cmqnxn1b50001ztus7m85vrlk';
const MENU_NAME = process.env.MENU_NAME ?? 'Balkans Menu';
const CURRENCY = process.env.IMPORT_CURRENCY ?? 'EGP';

type DfCategory = {
  id: string;
  odoo_id: number | null;
  name: string;
  name_ar: string | null;
  image_url: string | null;
  sequence: number;
  is_active: boolean;
};

type DfProduct = {
  id: string;
  odoo_template_id: number;
  odoo_id: number | null;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  base_price: string;
  image_url: string | null;
  category_id: string | null;
  is_active: boolean;
  prep_time_mins: number | null;
};

type DfModifier = {
  id: string;
  product_id: string;
  name: string;
  name_ar: string | null;
  display_type: string;
  required: boolean;
  min_select: number;
  max_select: number;
  sequence: number;
};

type DfOption = {
  id: string;
  modifier_id: string;
  name: string;
  name_ar: string | null;
  price_extra: string;
  is_default: boolean;
  sequence: number;
};

function externalRef(kind: 'cat' | 'prod', id: string) {
  return `dishflow:${kind}:${id}`;
}

function slugify(name: string, odooId: number | null, prefix: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `df-${prefix}-${odooId ?? base}`.slice(0, 150);
}

async function resetCatalog() {
  console.log('Resetting Cloud Kitchen catalog…');

  const companyAssignments = await prisma.menuAssignment.findMany({
    where: { is_active: true, scope_type: 'company' },
    select: { scope_id: true },
    distinct: ['scope_id'],
  });
  console.log(`  preserving ${companyAssignments.length} company menu assignment(s) for re-link`);

  await prisma.catalogMenuProduct.deleteMany({});
  await prisma.catalogMenuSection.deleteMany({});
  await prisma.menuAssignment.deleteMany({});
  await prisma.catalogMenu.deleteMany({});

  const platformProducts = await prisma.product.findMany({
    where: { company_id: null, is_deleted: false },
    select: { id: true },
  });
  const platformIds = platformProducts.map((p) => p.id);

  if (platformIds.length > 0) {
    await prisma.productOption.deleteMany({
      where: { option_group: { product_id: { in: platformIds } } },
    });
    await prisma.productOptionGroup.deleteMany({ where: { product_id: { in: platformIds } } });
    await prisma.productMedia.deleteMany({ where: { product_id: { in: platformIds } } });
    await prisma.productTranslation.deleteMany({ where: { product_id: { in: platformIds } } });
    await prisma.productPrice.deleteMany({ where: { product_id: { in: platformIds } } });
    await prisma.productVariant.deleteMany({ where: { product_id: { in: platformIds } } });
    await prisma.productAvailability.deleteMany({ where: { product_id: { in: platformIds } } });
    await prisma.productTag.deleteMany({ where: { product_id: { in: platformIds } } });

    const withOrders = await prisma.orderItem.findMany({
      where: { product_id: { in: platformIds } },
      select: { product_id: true },
      distinct: ['product_id'],
    });
    const locked = new Set(withOrders.map((r) => r.product_id).filter(Boolean) as string[]);
    const deletable = platformIds.filter((id) => !locked.has(id));

    if (deletable.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: deletable } } });
    }
    if (locked.size > 0) {
      await prisma.product.updateMany({
        where: { id: { in: [...locked] } },
        data: { is_deleted: true, is_active: false, deleted_at: new Date() },
      });
    }
    console.log(`  platform products removed: ${deletable.length}, soft-deleted (orders): ${locked.size}`);
  }

  await prisma.category.updateMany({
    where: { slug: { not: CUSTOM_CATEGORY_SLUG }, is_deleted: false },
    data: { is_deleted: true, is_active: false, deleted_at: new Date() },
  });

  return companyAssignments;
}

async function importFromDishflow(companyAssignments: Array<{ scope_id: string }>) {
  const pool = new Pool({ connectionString: DISHFLOW_URL });
  console.log(`Importing Balkans menu from Dishflow (${RESTAURANT_ID})…`);

  const { rows: categories } = await pool.query<DfCategory>(
    `SELECT id, odoo_id, name, name_ar, image_url, sequence, is_active
     FROM categories
     WHERE restaurant_id = $1
     ORDER BY sequence ASC, name ASC`,
    [RESTAURANT_ID],
  );

  const categoryMap = new Map<string, string>();
  let productsImported = 0;
  let modifiersImported = 0;

  for (const cat of categories) {
    const ext = externalRef('cat', cat.id);
    const slug = slugify(cat.name, cat.odoo_id, 'cat');
    const saved = await prisma.category.upsert({
      where: { external_ref: ext },
      create: {
        external_ref: ext,
        name: cat.name,
        name_ar: cat.name_ar,
        slug,
        image_url: cat.image_url,
        sort_order: cat.sequence,
        is_active: cat.is_active,
        is_deleted: false,
        deleted_at: null,
      },
      update: {
        name: cat.name,
        name_ar: cat.name_ar,
        image_url: cat.image_url,
        sort_order: cat.sequence,
        is_active: cat.is_active,
        is_deleted: false,
        deleted_at: null,
      },
    });
    categoryMap.set(cat.id, saved.id);
  }

  const categoryIds = categories.map((c) => c.id);
  const { rows: products } = await pool.query<DfProduct>(
    `SELECT id, odoo_template_id, odoo_id, name, name_ar, description, description_ar,
            base_price::text, image_url, category_id, is_active, prep_time_mins
     FROM products
     WHERE restaurant_id = $1 AND category_id = ANY($2::text[])
     ORDER BY name ASC`,
    [RESTAURANT_ID, categoryIds],
  );

  const productMap = new Map<string, string>();

  for (const p of products) {
    const ckCategoryId = p.category_id ? categoryMap.get(p.category_id) : null;
    if (!ckCategoryId) continue;

    const ext = externalRef('prod', p.id);
    const saved = await prisma.product.upsert({
      where: { external_ref: ext },
      create: {
        external_ref: ext,
        category_id: ckCategoryId,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        prep_time_mins: p.prep_time_mins,
        base_price: p.base_price,
        currency: CURRENCY,
        is_active: p.is_active,
        visibility: 'public',
        is_deleted: false,
        erp_reference_id: String(p.odoo_template_id),
        pos_reference_id: p.odoo_id != null ? String(p.odoo_id) : null,
        attributes: {
          dishflow: {
            id: p.id,
            restaurantId: RESTAURANT_ID,
            odooTemplateId: p.odoo_template_id,
            odooId: p.odoo_id,
          },
        } as Prisma.InputJsonValue,
      },
      update: {
        category_id: ckCategoryId,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        prep_time_mins: p.prep_time_mins,
        base_price: p.base_price,
        is_active: p.is_active,
        is_deleted: false,
        deleted_at: null,
        erp_reference_id: String(p.odoo_template_id),
        pos_reference_id: p.odoo_id != null ? String(p.odoo_id) : null,
      },
    });
    productMap.set(p.id, saved.id);
    productsImported++;

    if (p.image_url) {
      await prisma.productMedia.deleteMany({ where: { product_id: saved.id, is_primary: true } });
      await prisma.productMedia.create({
        data: {
          product_id: saved.id,
          media_type: 'image',
          url: p.image_url,
          is_primary: true,
          sort_order: 0,
        },
      });
    }

    if (p.name_ar) {
      await prisma.productTranslation.upsert({
        where: { product_id_language_code: { product_id: saved.id, language_code: 'ar' } },
        create: {
          product_id: saved.id,
          language_code: 'ar',
          name: p.name_ar,
          description: p.description_ar,
        },
        update: { name: p.name_ar, description: p.description_ar },
      });
    }

    const defaultList = await prisma.productPricingList.findFirst({ where: { is_default: true } });
    if (defaultList) {
      const existingPrice = await prisma.productPrice.findFirst({
        where: { pricing_list_id: defaultList.id, product_id: saved.id, variant_id: null },
      });
      if (!existingPrice) {
        await prisma.productPrice.create({
          data: {
            pricing_list_id: defaultList.id,
            product_id: saved.id,
            price: p.base_price,
            effective_from: new Date('2020-01-01'),
          },
        });
      } else {
        await prisma.productPrice.update({
          where: { id: existingPrice.id },
          data: { price: p.base_price },
        });
      }
    }
  }

  const dfProductIds = [...productMap.keys()];
  if (dfProductIds.length > 0) {
    const { rows: modifiers } = await pool.query<DfModifier>(
      `SELECT id, product_id, name, name_ar, display_type, required, min_select, max_select, sequence
       FROM product_modifiers
       WHERE product_id = ANY($1::text[])
       ORDER BY sequence ASC`,
      [dfProductIds],
    );

    for (const mod of modifiers) {
      const ckProductId = productMap.get(mod.product_id);
      if (!ckProductId) continue;

      await prisma.productOption.deleteMany({
        where: { option_group: { product_id: ckProductId, name: mod.name } },
      });
      await prisma.productOptionGroup.deleteMany({
        where: { product_id: ckProductId, name: mod.name },
      });

      const group = await prisma.productOptionGroup.create({
        data: {
          product_id: ckProductId,
          name: mod.name,
          selection_type: mod.display_type === 'checkbox' ? 'multiple' : 'single',
          min_select: mod.min_select,
          max_select: mod.max_select,
          is_required: mod.required,
        },
      });
      modifiersImported++;

      const { rows: options } = await pool.query<DfOption>(
        `SELECT id, modifier_id, name, name_ar, price_extra::text, is_default, sequence
         FROM modifier_options WHERE modifier_id = $1 ORDER BY sequence ASC`,
        [mod.id],
      );

      for (const opt of options) {
        await prisma.productOption.create({
          data: {
            option_group_id: group.id,
            name: opt.name,
            price_adjustment: opt.price_extra,
            is_active: true,
            sort_order: opt.sequence,
          },
        });
      }
    }
  }

  const menu = await prisma.catalogMenu.create({
    data: {
      name: MENU_NAME,
      menu_type: 'general',
      description: `Imported from Dishflow Balkans (${RESTAURANT_ID})`,
      is_active: true,
    },
  });

  for (const cat of categories) {
    const ckCatId = categoryMap.get(cat.id);
    if (!ckCatId) continue;

    const section = await prisma.catalogMenuSection.create({
      data: {
        catalog_menu_id: menu.id,
        name: cat.name_ar && cat.name ? `${cat.name}` : cat.name,
        sort_order: cat.sequence,
      },
    });

    const catProducts = products.filter((p) => p.category_id === cat.id);
    for (let i = 0; i < catProducts.length; i++) {
      const ckProdId = productMap.get(catProducts[i]!.id);
      if (!ckProdId) continue;
      await prisma.catalogMenuProduct.create({
        data: {
          catalog_menu_section_id: section.id,
          product_id: ckProdId,
          sort_order: i + 1,
          is_featured: i === 0,
        },
      });
    }
  }

  for (const row of companyAssignments) {
    await prisma.menuAssignment.create({
      data: {
        catalog_menu_id: menu.id,
        scope_type: 'company',
        scope_id: row.scope_id,
        priority: 10,
        is_active: true,
      },
    });
  }

  await pool.end();

  console.log('\n✅ Reset + import complete');
  console.log(`  categories: ${categories.length}`);
  console.log(`  products: ${productsImported}`);
  console.log(`  modifier groups: ${modifiersImported}`);
  console.log(`  menu: ${menu.name} (${menu.id})`);
  console.log(`  companies re-assigned: ${companyAssignments.length}`);
}

async function main() {
  const assignments = await resetCatalog();
  await importFromDishflow(assignments);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
