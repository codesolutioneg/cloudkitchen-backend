/**
 * Seeds ESTIMATED per-serving nutrition for products that have none, so the
 * budget meal planner has something to work with.
 *
 * These figures are category-band estimates, not measured values. Every row is
 * written with source = 'estimate' and NO allergens, because inventing allergen
 * data is dangerous: an empty allergen list here means "not yet recorded", not
 * "allergen free". The kitchen must review before this is shown to a client who
 * relies on it.
 *
 * Idempotent: products that already have nutrition are left untouched, so a
 * kitchen-entered row is never overwritten by an estimate.
 *
 * Usage: npx tsx scripts/estimate-product-nutrition.ts [--overwrite]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OVERWRITE = process.argv.includes('--overwrite');

interface Band {
  componentType: string;
  kcal: [number, number];
  protein: [number, number];
  carbs: [number, number];
  fat: [number, number];
  servingG: [number, number];
}

/** Category name (lower case, trimmed) to its meal component and macro band. */
const BANDS: Array<{ match: RegExp; band: Band }> = [
  {
    match: /balkans meals (beef|chick)|manger meals/i,
    band: { componentType: 'protein', kcal: [520, 780], protein: [38, 55], carbs: [30, 55], fat: [18, 34], servingG: [320, 480] },
  },
  {
    match: /burger/i,
    band: { componentType: 'protein', kcal: [430, 690], protein: [24, 40], carbs: [32, 52], fat: [20, 36], servingG: [180, 300] },
  },
  {
    match: /chicken sandwich|egg sandwich/i,
    band: { componentType: 'protein', kcal: [380, 620], protein: [22, 38], carbs: [34, 56], fat: [14, 28], servingG: [200, 320] },
  },
  {
    match: /toast|breakfast/i,
    band: { componentType: 'carb', kcal: [300, 560], protein: [10, 22], carbs: [38, 70], fat: [10, 24], servingG: [180, 300] },
  },
  {
    match: /^salad$/i,
    band: { componentType: 'salad', kcal: [110, 300], protein: [4, 16], carbs: [10, 26], fat: [4, 18], servingG: [150, 280] },
  },
  {
    match: /starter|extra/i,
    band: { componentType: 'side', kcal: [140, 360], protein: [4, 14], carbs: [16, 40], fat: [6, 20], servingG: [100, 220] },
  },
  {
    match: /dessert/i,
    band: { componentType: 'dessert', kcal: [220, 480], protein: [3, 9], carbs: [30, 62], fat: [8, 24], servingG: [90, 180] },
  },
  {
    match: /coffee|shake|smoothie|juice|mejito|drink/i,
    band: { componentType: 'drink', kcal: [40, 320], protein: [0, 10], carbs: [6, 48], fat: [0, 12], servingG: [200, 400] },
  },
];

/** Deterministic 0..1 from the product id, so re-runs produce the same numbers. */
function spread(id: string, salt: number): number {
  let hash = salt;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100003;
  }
  return (hash % 1000) / 1000;
}

function pick(id: string, salt: number, [min, max]: [number, number], decimals = 1): string {
  return (min + spread(id, salt) * (max - min)).toFixed(decimals);
}

async function main() {
  const products = await prisma.product.findMany({
    where: { is_deleted: false },
    include: { category: { select: { name: true } }, nutrition: { select: { id: true } } },
    orderBy: { name: 'asc' },
  });

  let written = 0;
  let skippedExisting = 0;
  const unmatched = new Set<string>();

  for (const product of products) {
    if (product.nutrition && !OVERWRITE) {
      skippedExisting += 1;
      continue;
    }

    const categoryName = product.category?.name ?? '';
    // Custom products are per-company one-offs with no fixed recipe.
    if (/custom order/i.test(categoryName)) continue;

    const entry = BANDS.find((b) => b.match.test(categoryName));
    if (!entry) {
      unmatched.add(categoryName);
      continue;
    }

    const { band } = entry;
    const values = {
      component_type: band.componentType,
      serving_size_g: Math.round(Number(pick(product.id, 7, band.servingG, 0))),
      calories_kcal: pick(product.id, 1, band.kcal),
      protein_g: pick(product.id, 2, band.protein),
      carbs_g: pick(product.id, 3, band.carbs),
      fat_g: pick(product.id, 4, band.fat),
      // Deliberately no allergens: absence here means "not recorded".
      allergens: [],
      source: 'estimate',
    };

    await prisma.productNutrition.upsert({
      where: { product_id: product.id },
      create: { product_id: product.id, ...values },
      update: values,
    });
    written += 1;
  }

  const byComponent = await prisma.productNutrition.groupBy({
    by: ['component_type'],
    _count: { _all: true },
  });

  console.log(`wrote ${written} estimated nutrition rows, left ${skippedExisting} existing rows alone`);
  for (const row of byComponent.sort((a, b) => a.component_type.localeCompare(b.component_type))) {
    console.log(`  ${row.component_type.padEnd(10)} ${row._count._all}`);
  }
  if (unmatched.size > 0) {
    console.log(`no band for categories: ${[...unmatched].filter(Boolean).join(', ')}`);
  }
  console.log('\nESTIMATES ONLY. Allergens are unrecorded, not empty. Have the kitchen');
  console.log('review before any client relies on these figures.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
