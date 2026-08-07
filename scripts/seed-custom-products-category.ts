/**
 * Seed the global custom-orders category used for company custom products.
 * Run: npx tsx scripts/seed-custom-products-category.ts
 */
import { PrismaClient } from '@prisma/client';
import { CUSTOM_CATEGORY_SLUG } from '../src/modules/catalog/custom-products.service';

const prisma = new PrismaClient();

async function main() {
  await prisma.category.upsert({
    where: { slug: CUSTOM_CATEGORY_SLUG },
    update: {
      name: 'Custom Orders',
      name_ar: 'طلبات مخصصة',
      is_active: true,
      sort_order: 9999,
    },
    create: {
      name: 'Custom Orders',
      name_ar: 'طلبات مخصصة',
      slug: CUSTOM_CATEGORY_SLUG,
      is_active: true,
      sort_order: 9999,
      created_by_type: 'system',
    },
  });
  console.log('Custom orders category ready');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
