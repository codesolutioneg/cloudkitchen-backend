/**
 * Import categories, products, modifiers, and menu from Dishflow PostgreSQL.
 *
 * Usage:
 *   DISHFLOW_DATABASE_URL=postgresql://... tsx scripts/import-dishflow-catalog.ts
 *
 * Options (env):
 *   DISHFLOW_RESTAURANT_ID — default Balkans restaurant
 *   DISHFLOW_CATEGORY_LIMIT — max categories (default: all)
 *   DISHFLOW_MENU_NAME — menu name (default: "Balkans Imported Menu")
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DISHFLOW_URL =
  process.env.DISHFLOW_DATABASE_URL ??
  'postgresql://dishflow:a711e57e48b49bde73844c26649f920d@localhost:5432/dishflow';

const RESTAURANT_ID =
  process.env.DISHFLOW_RESTAURANT_ID ?? 'cmqnxn1b50001ztus7m85vrlk'; // Balkans

const CATEGORY_LIMIT = process.env.DISHFLOW_CATEGORY_LIMIT
  ? Number(process.env.DISHFLOW_CATEGORY_LIMIT)
  : null;

const MENU_NAME = process.env.DISHFLOW_MENU_NAME ?? 'Balkans Imported Menu';
const CURRENCY = process.env.BUSINESS_DEFAULT_CURRENCY ?? 'SAR';

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
  prep_time_mins: number;
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

function slugify(name: string, odooId: number | null, prefix: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `df-${prefix}-${odooId ?? base}`.slice(0, 150);
}

function externalRef(kind: 'cat' | 'prod', id: string) {
  return `dishflow:${kind}:${id}`;
}

async function main() {
  const pool = new Pool({ connectionString: DISHFLOW_URL });
  console.log('Dishflow import → CloudKitchen catalog');
  console.log(`  source: ${DISHFLOW_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`  restaurant: ${RESTAURANT_ID}`);

  const catLimitSql = CATEGORY_LIMIT ? `LIMIT ${CATEGORY_LIMIT}` : '';
  const { rows: categories } = await pool.query<DfCategory>(
    `SELECT id, odoo_id, name, name_ar, image_url, sequence, is_active
     FROM categories
     WHERE restaurant_id = $1
     ORDER BY sequence ASC, name ASC
     ${catLimitSql}`,
    [RESTAURANT_ID],
  );

  console.log(`  categories to import: ${categories.length}`);

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
      },
      update: {
        name: cat.name,
        name_ar: cat.name_ar,
        image_url: cat.image_url,
        sort_order: cat.sequence,
        is_active: cat.is_active,
      },
    });
    categoryMap.set(cat.id, saved.id);
  }

  const categoryIds = categories.map((c) => c.id);
  if (categoryIds.length === 0) {
    console.log('No categories found — done.');
    await pool.end();
    return;
  }

  const { rows: products } = await pool.query<DfProduct>(
    `SELECT id, odoo_template_id, odoo_id, name, name_ar, description, description_ar,
            base_price::text, image_url, category_id, is_active, prep_time_mins
     FROM products
     WHERE restaurant_id = $1 AND category_id = ANY($2::text[])
     ORDER BY name ASC`,
    [RESTAURANT_ID, categoryIds],
  );

  console.log(`  products to import: ${products.length}`);

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
        where: {
          product_id_language_code: { product_id: saved.id, language_code: 'ar' },
        },
        create: {
          product_id: saved.id,
          language_code: 'ar',
          name: p.name_ar,
          description: p.description_ar,
        },
        update: {
          name: p.name_ar,
          description: p.description_ar,
        },
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

      const extMod = `dishflow:mod:${mod.id}`;
      const existingGroups = await prisma.productOptionGroup.findMany({
        where: { product_id: ckProductId },
      });
      let group = existingGroups.find((g) => g.name === mod.name);

      if (!group) {
        group = await prisma.productOptionGroup.create({
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
      } else {
        await prisma.productOptionGroup.update({
          where: { id: group.id },
          data: {
            selection_type: mod.display_type === 'checkbox' ? 'multiple' : 'single',
            min_select: mod.min_select,
            max_select: mod.max_select,
            is_required: mod.required,
          },
        });
      }

      const { rows: options } = await pool.query<DfOption>(
        `SELECT id, modifier_id, name, name_ar, price_extra::text, is_default, sequence
         FROM modifier_options WHERE modifier_id = $1 ORDER BY sequence ASC`,
        [mod.id],
      );

      for (const opt of options) {
        const existingOpt = await prisma.productOption.findFirst({
          where: { option_group_id: group.id, name: opt.name },
        });
        if (!existingOpt) {
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

      void extMod;
    }
  }

  const menuExt = `dishflow:menu:${RESTAURANT_ID}`;
  let menu = await prisma.catalogMenu.findFirst({ where: { name: MENU_NAME } });
  if (!menu) {
    menu = await prisma.catalogMenu.create({
      data: {
        name: MENU_NAME,
        menu_type: 'general',
        description: `Imported from Dishflow restaurant ${RESTAURANT_ID}`,
        is_active: true,
      },
    });
  }

  for (const cat of categories) {
    const ckCatId = categoryMap.get(cat.id);
    if (!ckCatId) continue;

    let section = await prisma.catalogMenuSection.findFirst({
      where: { catalog_menu_id: menu.id, name: cat.name },
    });
    if (!section) {
      section = await prisma.catalogMenuSection.create({
        data: {
          catalog_menu_id: menu.id,
          name: cat.name,
          sort_order: cat.sequence,
        },
      });
    }

    const catProducts = products.filter((p) => p.category_id === cat.id);
    for (let i = 0; i < catProducts.length; i++) {
      const ckProdId = productMap.get(catProducts[i].id);
      if (!ckProdId) continue;
      await prisma.catalogMenuProduct.upsert({
        where: {
          catalog_menu_section_id_product_id: {
            catalog_menu_section_id: section.id,
            product_id: ckProdId,
          },
        },
        create: {
          catalog_menu_section_id: section.id,
          product_id: ckProdId,
          sort_order: i + 1,
          is_featured: i === 0,
        },
        update: { sort_order: i + 1 },
      });
    }
  }

  void menuExt;

  await pool.end();

  console.log('\n✅ Import complete');
  console.log(`  categories: ${categories.length}`);
  console.log(`  products: ${productsImported}`);
  console.log(`  modifiers (new groups): ${modifiersImported}`);
  console.log(`  menu: ${menu.name} (${menu.id})`);
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
