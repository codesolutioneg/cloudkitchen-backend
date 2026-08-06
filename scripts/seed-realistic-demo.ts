/**
 * Wipe demo/imported transactional data and reseed with realistic Faker names.
 *
 * Keeps platform foundations (roles, pages, workflows, languages, Super Admin).
 *
 * Usage:
 *   npm run seed:demo
 *   DEMO_SEED=42 npm run seed:demo
 */
import path from 'node:path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/prisma/client';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SEED = Number(process.env.DEMO_SEED ?? Date.now() % 1_000_000);
faker.seed(SEED);
faker.setDefaultRefDate(new Date('2026-07-01'));

const CURRENCY = process.env.BUSINESS_DEFAULT_CURRENCY ?? 'SAR';
const COMPANY_PASSWORD = 'SecurePass123!';
// All ten categories so the meal planner has every component (salad, side, drink…).
const CATEGORY_COUNT = Number(process.env.DEMO_CATEGORIES ?? 10);
const PRODUCTS_PER_CATEGORY = Number(process.env.DEMO_PRODUCTS_PER_CATEGORY ?? 6);
const COMPANY_COUNT = Number(process.env.DEMO_COMPANIES ?? 6);
const ORDERS_PER_COMPANY = Number(process.env.DEMO_ORDERS_PER_COMPANY ?? 3);

/** Stable IDs expected by integration tests — names become realistic. */
const SEED_CATEGORY_ID = '00000000-0000-4000-8000-000000000101';
const SEED_PRODUCT_ID = '00000000-0000-4000-8000-000000000102';
const SEED_MENU_ID = '00000000-0000-4000-8000-000000000103';
const SEED_MENU_SECTION_ID = '00000000-0000-4000-8000-000000000104';
const SEED_PRODUCT_PRICE_ID = '00000000-0000-4000-8000-000000000105';
const SEED_PRICING_LIST_ID = '00000000-0000-4000-8000-000000000099';

const FOOD_CATEGORIES = [
  { en: 'Breakfast', ar: 'الإفطار' },
  { en: 'Hot Coffee', ar: 'قهوة ساخنة' },
  { en: 'Fresh Juices', ar: 'عصائر طازجة' },
  { en: 'Sandwiches', ar: 'ساندويتشات' },
  { en: 'Burgers', ar: 'برجر' },
  { en: 'Chicken Meals', ar: 'وجبات دجاج' },
  { en: 'Starters', ar: 'مقبلات' },
  { en: 'Desserts', ar: 'حلويات' },
  { en: 'Smoothies', ar: 'سموثي' },
  { en: 'Salads', ar: 'سلطات' },
];

/**
 * Which meal component each demo category plays, plus a realistic per-serving
 * macro band. The budget planner picks one product per component slot, so the
 * demo catalog has to cover protein, carb, salad, side, drink and dessert.
 */
const CATEGORY_NUTRITION: Record<
  string,
  {
    componentType: string;
    kcal: [number, number];
    protein: [number, number];
    carbs: [number, number];
    fat: [number, number];
    allergens: string[];
  }
> = {
  Breakfast: { componentType: 'carb', kcal: [320, 620], protein: [10, 24], carbs: [38, 78], fat: [8, 26], allergens: ['gluten', 'egg'] },
  'Hot Coffee': { componentType: 'drink', kcal: [5, 180], protein: [0, 8], carbs: [0, 22], fat: [0, 9], allergens: ['dairy'] },
  'Fresh Juices': { componentType: 'drink', kcal: [90, 210], protein: [1, 4], carbs: [22, 48], fat: [0, 2], allergens: [] },
  Sandwiches: { componentType: 'carb', kcal: [380, 680], protein: [16, 32], carbs: [42, 82], fat: [10, 28], allergens: ['gluten'] },
  Burgers: { componentType: 'protein', kcal: [480, 880], protein: [26, 48], carbs: [32, 60], fat: [22, 48], allergens: ['gluten', 'dairy'] },
  'Chicken Meals': { componentType: 'protein', kcal: [420, 780], protein: [34, 58], carbs: [18, 52], fat: [12, 34], allergens: [] },
  Starters: { componentType: 'side', kcal: [140, 380], protein: [4, 14], carbs: [14, 42], fat: [6, 22], allergens: ['sesame'] },
  Desserts: { componentType: 'dessert', kcal: [220, 520], protein: [3, 9], carbs: [30, 68], fat: [8, 26], allergens: ['dairy', 'nuts', 'gluten'] },
  Smoothies: { componentType: 'drink', kcal: [160, 340], protein: [3, 12], carbs: [26, 56], fat: [2, 10], allergens: ['dairy'] },
  Salads: { componentType: 'salad', kcal: [120, 340], protein: [4, 18], carbs: [10, 30], fat: [4, 20], allergens: ['sesame'] },
};

/**
 * Menu item names are drawn from one shared pool, so a dish can land in a
 * category that does not match what it actually is. The planner cares about the
 * component, not the merchandising category, so the name wins when it is
 * unambiguous and the category profile is the fallback.
 */
function componentForProduct(name: string, categoryComponent: string): string {
  const n = name.toLowerCase();
  if (/salad/.test(n)) return 'salad';
  if (/latte|cappuccino|coffee|mejito|juice|smoothie/.test(n)) return 'drink';
  if (/cake|kunafa|cheesecake|dessert/.test(n)) return 'dessert';
  if (/chicken|beef|wings|shawarma|burger|bacon|halloumi/.test(n)) return 'protein';
  if (/toast|sandwich|wrap|bowl|plate/.test(n)) return 'carb';
  if (/mini box|pieces/.test(n)) return 'side';
  return categoryComponent;
}

const MENU_ITEM_NAMES = [
  'Shakshuka Plate',
  'Sourdough Toast Bowl',
  'Avocado Feta Toast',
  'Frank Chicken',
  'Frank Beef',
  'Balkans Club Toast',
  'Bacon Burger',
  'Grilled Halloumi Wrap',
  'Spicy Chicken Sandwich',
  'Mediterranean Salad',
  'Fresh Orange Mejito',
  'Iced Spanish Latte',
  'Classic Cappuccino',
  'Banana Date Smoothie',
  'Mini Box 5 Pieces',
  'Chocolate Molten Cake',
  'Kunafa Cheesecake',
  'Herb Grilled Chicken',
  'Beef Shawarma Platter',
  'Honey Garlic Wings',
];

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function money(min: number, max: number) {
  return faker.number.float({ min, max, fractionDigits: 2 }).toFixed(2);
}

async function wipeTransactionalData() {
  console.log('▶ Wiping transactional / demo catalog data…');

  await prisma.orderItemOption.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.orderNote.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderApproval.deleteMany();
  await prisma.orderDeliveryDetails.deleteMany();
  await prisma.orderCancellation.deleteMany();
  await prisma.order.deleteMany();

  await prisma.entityWorkflowHistory.deleteMany();
  await prisma.entityWorkflowInstance.deleteMany();

  await prisma.companyUserOtpCode.deleteMany();
  await prisma.companyUserPasswordResetToken.deleteMany();
  await prisma.companyUserLoginHistory.deleteMany();
  await prisma.companyUserRefreshToken.deleteMany();
  await prisma.companyUserSession.deleteMany();
  await prisma.companyUserRole.deleteMany();
  await prisma.companyUser.deleteMany();

  await prisma.companyConfigurationHistory.deleteMany();
  await prisma.companyAddress.deleteMany();
  await prisma.companyApprovalHistory.deleteMany();
  await prisma.companyFeature.deleteMany();
  await prisma.companyModule.deleteMany();
  await prisma.companyConfiguration.deleteMany();
  await prisma.companyPricingListAssignment.deleteMany();
  await prisma.department.deleteMany();
  await prisma.companyRole.deleteMany();
  await prisma.dashboardUserCompanyAssignment.deleteMany();

  await prisma.calendarEvent.deleteMany({ where: { calendar: { company_id: { not: null } } } });
  await prisma.calendar.deleteMany({ where: { company_id: { not: null } } });

  // Company-scoped workflows / approval workflows (keep global templates)
  const companyWorkflows = await prisma.workflow.findMany({
    where: { company_id: { not: null } },
    select: { id: true },
  });
  if (companyWorkflows.length) {
    const ids = companyWorkflows.map((w) => w.id);
    await prisma.workflowAction.deleteMany({ where: { workflow_step: { workflow_id: { in: ids } } } });
    await prisma.workflowCondition.deleteMany({
      where: { workflow_transition: { workflow_id: { in: ids } } },
    });
    await prisma.workflowTransition.deleteMany({ where: { workflow_id: { in: ids } } });
    await prisma.workflowStep.deleteMany({ where: { workflow_id: { in: ids } } });
    await prisma.workflow.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.approvalWorkflow.deleteMany({ where: { company_id: { not: null } } });

  await prisma.company.deleteMany();

  await prisma.menuAssignment.deleteMany();
  await prisma.catalogMenuProduct.deleteMany();
  await prisma.catalogMenuSection.deleteMany();
  await prisma.catalogMenu.deleteMany();

  await prisma.productNutrition.deleteMany();
  await prisma.productPrice.deleteMany();
  await prisma.productTag.deleteMany();
  await prisma.productAvailability.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.productOptionGroup.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productMedia.deleteMany();
  await prisma.productTranslation.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();

  await prisma.productPricingList.deleteMany({ where: { is_default: false } });

  console.log('  wiped companies, orders, menus, catalog');
}

async function ensureDefaultPricingList() {
  let list = await prisma.productPricingList.findFirst({
    where: { OR: [{ id: SEED_PRICING_LIST_ID }, { is_default: true }] },
  });
  if (!list) {
    list = await prisma.productPricingList.create({
      data: {
        id: SEED_PRICING_LIST_ID,
        name: 'Default SAR',
        currency: CURRENCY,
        is_default: true,
      },
    });
  } else if (list.id !== SEED_PRICING_LIST_ID) {
    // Keep existing default; tests prefer fixed id when present
    list = list;
  }
  return list;
}

async function seedRealisticCatalog(pricingListId: string) {
  console.log('▶ Seeding realistic catalog…');
  const categories = FOOD_CATEGORIES.slice(0, CATEGORY_COUNT);
  const usedNames = new Set<string>();
  const createdProducts: Array<{ id: string; name: string; categoryId: string; price: string }> = [];
  const createdCategories: Array<{ id: string; name: string }> = [];

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]!;
    const slugBase = slugify(cat.en);
    const category = await prisma.category.create({
      data: {
        name: cat.en,
        name_ar: cat.ar,
        slug: `${slugBase}-${SEED}-${i}`,
        sort_order: i + 1,
        is_active: true,
        image_url: `https://picsum.photos/seed/${SEED}-cat-${i}/640/480`,
      },
    });
    createdCategories.push({ id: category.id, name: category.name });

    for (let p = 0; p < PRODUCTS_PER_CATEGORY; p++) {
      let name = faker.helpers.arrayElement(MENU_ITEM_NAMES);
      let attempts = 0;
      while (usedNames.has(name) && attempts < 40) {
        name = `${faker.helpers.arrayElement(MENU_ITEM_NAMES)} ${faker.helpers.arrayElement([
          'Classic',
          'Signature',
          'House',
          'Royal',
          'Local',
        ])}`;
        attempts++;
      }
      usedNames.add(name);

      const price = money(18, 95);
      const product = await prisma.product.create({
        data: {
          category_id: category.id,
          name,
          description: faker.commerce.productDescription(),
          image_url: `https://picsum.photos/seed/${SEED}-p-${i}-${p}/800/600`,
          prep_time_mins: faker.number.int({ min: 10, max: 40 }),
          base_price: price,
          currency: CURRENCY,
          sku: `CK-${SEED}-${i}${p}-${faker.string.alphanumeric(4).toUpperCase()}`,
          barcode: faker.string.numeric(13),
          is_active: true,
          visibility: 'public',
          sort_order: p + 1,
          attributes: {
            cuisine: faker.helpers.arrayElement(['Mediterranean', 'Gulf', 'Italian', 'Asian Fusion']),
            spicy: faker.datatype.boolean(),
            calories: faker.number.int({ min: 220, max: 980 }),
          } as Prisma.InputJsonValue,
        },
      });

      await prisma.productMedia.create({
        data: {
          product_id: product.id,
          media_type: 'image',
          url: product.image_url!,
          is_primary: true,
          sort_order: 0,
        },
      });

      const arLang = await prisma.language.findUnique({ where: { code: 'ar' } });
      if (arLang) {
        await prisma.productTranslation.create({
          data: {
            product_id: product.id,
            language_code: 'ar',
            name: `${cat.ar} — ${name}`,
            description: 'وجبة مُعدة يوميًا بمكونات طازجة',
          },
        });
      }

      await prisma.productPrice.create({
        data: {
          pricing_list_id: pricingListId,
          product_id: product.id,
          price,
          effective_from: new Date('2020-01-01'),
        },
      });

      const profile = CATEGORY_NUTRITION[cat.en];
      if (profile) {
        const between = ([min, max]: [number, number]) =>
          faker.number.float({ min, max, fractionDigits: 1 }).toFixed(1);
        await prisma.productNutrition.create({
          data: {
            product_id: product.id,
            component_type: componentForProduct(name, profile.componentType),
            serving_size_g: faker.number.int({ min: 150, max: 450 }),
            calories_kcal: between(profile.kcal),
            protein_g: between(profile.protein),
            carbs_g: between(profile.carbs),
            fat_g: between(profile.fat),
            fiber_g: faker.number.float({ min: 0, max: 9, fractionDigits: 1 }).toFixed(1),
            sodium_mg: faker.number.int({ min: 60, max: 1400 }).toString(),
            allergens: faker.helpers.arrayElements(profile.allergens, {
              min: 0,
              max: profile.allergens.length,
            }),
            source: 'supplier',
          },
        });
      }

      if (faker.datatype.boolean()) {
        await prisma.productOptionGroup.create({
          data: {
            product_id: product.id,
            name: faker.helpers.arrayElement(['Bread Type', 'Sauce', 'Size', 'Extras', 'Spice Level']),
            selection_type: faker.helpers.arrayElement(['single', 'multiple']),
            min_select: 0,
            max_select: 2,
            is_required: faker.datatype.boolean(),
            options: {
              create: [
                { name: 'Regular', price_adjustment: '0.00', sort_order: 1, is_active: true },
                { name: 'Premium', price_adjustment: money(3, 18), sort_order: 2, is_active: true },
                { name: 'Chef special', price_adjustment: money(5, 25), sort_order: 3, is_active: true },
              ],
            },
          },
        });
      }

      createdProducts.push({ id: product.id, name: product.name, categoryId: category.id, price });
    }
  }

  console.log(`  ${createdCategories.length} categories, ${createdProducts.length} products`);
  return { createdCategories, createdProducts };
}

/** Fixed-UUID rows for integration tests, with realistic display names. */
async function seedStableTestFixtures(pricingListId: string) {
  console.log('▶ Seeding stable test fixtures (realistic names)…');

  await prisma.category.create({
    data: {
      id: SEED_CATEGORY_ID,
      name: 'Signature Meals',
      name_ar: 'وجبات مميزة',
      slug: `signature-meals-${SEED}`,
      sort_order: 0,
      is_active: true,
      image_url: `https://picsum.photos/seed/${SEED}-stable-cat/640/480`,
    },
  });

  await prisma.product.create({
    data: {
      id: SEED_PRODUCT_ID,
      category_id: SEED_CATEGORY_ID,
      name: 'Herb Roasted Chicken Plate',
      description: 'Charcoal-roasted chicken with garlic rice, mixed salad, and house tahini.',
      image_url: `https://picsum.photos/seed/${SEED}-stable-prod/800/600`,
      prep_time_mins: 25,
      base_price: '48.00',
      currency: CURRENCY,
      sku: `CK-STABLE-${SEED}`,
      is_active: true,
      visibility: 'public',
      sort_order: 1,
    },
  });

  await prisma.productPrice.create({
    data: {
      id: SEED_PRODUCT_PRICE_ID,
      pricing_list_id: pricingListId,
      product_id: SEED_PRODUCT_ID,
      price: '48.00',
      effective_from: new Date('2020-01-01'),
    },
  });

  await prisma.productNutrition.create({
    data: {
      product_id: SEED_PRODUCT_ID,
      component_type: 'protein',
      serving_size_g: 420,
      calories_kcal: '640.00',
      protein_g: '52.00',
      carbs_g: '44.00',
      fat_g: '24.00',
      fiber_g: '5.00',
      sodium_mg: '780.00',
      allergens: ['sesame'],
      source: 'supplier',
    },
  });

  await prisma.catalogMenu.create({
    data: {
      id: SEED_MENU_ID,
      name: 'Platform Corporate Menu',
      menu_type: 'general',
      description: 'Stable fixture menu for order integration tests',
      is_active: true,
    },
  });

  await prisma.catalogMenuSection.create({
    data: {
      id: SEED_MENU_SECTION_ID,
      catalog_menu_id: SEED_MENU_ID,
      name: 'Mains',
      sort_order: 1,
    },
  });

  await prisma.catalogMenuProduct.create({
    data: {
      catalog_menu_section_id: SEED_MENU_SECTION_ID,
      product_id: SEED_PRODUCT_ID,
      sort_order: 1,
      is_featured: true,
    },
  });
}

async function seedMenus(
  createdCategories: Array<{ id: string; name: string }>,
  createdProducts: Array<{ id: string; name: string; categoryId: string; price: string }>,
) {
  console.log('▶ Seeding demo menus…');
  const menu = await prisma.catalogMenu.create({
    data: {
      name: faker.helpers.arrayElement([
        'Balkans Corporate Menu',
        'Riyadh Hub Daily Menu',
        'Central Kitchen All-Day Menu',
        'City Gate Business Lunch Menu',
      ]),
      menu_type: 'general',
      description: 'Realistic demo menu for company browsing and order flow testing',
      is_active: true,
    },
  });

  for (let i = 0; i < createdCategories.length; i++) {
    const cat = createdCategories[i]!;
    const section = await prisma.catalogMenuSection.create({
      data: {
        catalog_menu_id: menu.id,
        name: cat.name,
        sort_order: i + 1,
      },
    });
    const sectionProducts = createdProducts.filter((p) => p.categoryId === cat.id);
    for (let j = 0; j < sectionProducts.length; j++) {
      const p = sectionProducts[j]!;
      await prisma.catalogMenuProduct.create({
        data: {
          catalog_menu_section_id: section.id,
          product_id: p.id,
          sort_order: j + 1,
          is_featured: j === 0,
        },
      });
    }
  }

  console.log(`  menu: ${menu.name}`);
  return menu;
}

async function seedCompaniesAndOrders(
  menuId: string,
  pricingListId: string,
  products: Array<{ id: string; name: string; price: string }>,
) {
  console.log('▶ Seeding companies, users, and orders…');
  const passwordHash = await bcrypt.hash(COMPANY_PASSWORD, 10);
  const admin = await prisma.dashboardUser.findUnique({ where: { email: 'admin@cloudkitchen.example' } });
  const workflow = await prisma.workflow.findFirst({
    where: { workflow_type: 'order', is_active: true, company_id: null },
    include: { steps: { where: { code: 'submitted' }, take: 1 } },
  });
  const submittedStepId = workflow?.steps[0]?.id;

  const companyCreds: Array<{ legalName: string; userEmail: string; password: string }> = [];

  for (let i = 0; i < COMPANY_COUNT; i++) {
    const legalName = faker.company.name();
    const tradeName = faker.company.catchPhrase();
    const contact = faker.person.fullName();
    const domain = faker.internet.domainName();
    const emailLocal = slugify(legalName).slice(0, 18) || `co${i}`;
    const primaryEmail = `orders.${emailLocal}@${domain}`;
    const userEmail = `${emailLocal}.buyer@${domain}`.toLowerCase();

    const company = await prisma.company.create({
      data: {
        legal_name: legalName,
        trade_name: tradeName,
        commercial_registration_no: `CR-${SEED}-${1000 + i}`,
        tax_registration_no: `VAT-${SEED}-${2000 + i}`,
        industry_sector: faker.helpers.arrayElement([
          'Technology',
          'Healthcare',
          'Education',
          'Hospitality',
          'Finance',
        ]),
        company_size: faker.helpers.arrayElement(['11-50', '51-200', '201-500']),
        country_code: 'SA',
        city: faker.helpers.arrayElement(['Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Madinah']),
        primary_contact_name: contact,
        primary_contact_title: faker.person.jobTitle(),
        primary_email: primaryEmail,
        primary_phone: `+9665${faker.string.numeric(8)}`,
        website: `https://${domain}`,
        default_currency: CURRENCY,
        default_timezone: 'Asia/Riyadh',
        default_language_code: 'en',
        status: 'active',
        approval_status: 'approved',
        approval_notes: 'Approved for realistic demo dataset',
        approved_by: admin?.id ?? null,
        approved_at: new Date(),
        onboarding_source: 'admin_created',
      },
    });

    const address = await prisma.companyAddress.create({
      data: {
        company_id: company.id,
        address_type: 'delivery',
        label: 'HQ',
        address_line1: faker.location.streetAddress(),
        city: company.city,
        country_code: 'SA',
        postal_code: faker.location.zipCode(),
        contact_name: contact,
        contact_phone: company.primary_phone,
        is_default: true,
      },
    });

    const user = await prisma.companyUser.create({
      data: {
        company_id: company.id,
        full_name: contact,
        email: userEmail,
        mobile: `+9665${faker.string.numeric(8)}`,
        password_hash: passwordHash,
        status: 'active',
        is_primary_contact: true,
        preferred_language_code: 'en',
      },
    });

    await prisma.menuAssignment.create({
      data: {
        catalog_menu_id: menuId,
        scope_type: 'company',
        scope_id: company.id,
        priority: 10,
        is_active: true,
      },
    });

    await prisma.companyPricingListAssignment.create({
      data: {
        company_id: company.id,
        pricing_list_id: pricingListId,
        effective_from: new Date('2020-01-01'),
      },
    });

    companyCreds.push({ legalName, userEmail: user.email, password: COMPANY_PASSWORD });

    // A factory-canteen brief per company, left as a draft so the dashboard
    // "Generate" action has something real to solve.
    const planStart = new Date();
    planStart.setUTCDate(planStart.getUTCDate() + 1);
    const planEnd = new Date(planStart);
    planEnd.setUTCDate(planEnd.getUTCDate() + 4);
    await prisma.mealPlan.create({
      data: {
        company_id: company.id,
        name: `${legalName} plant canteen week`,
        description: 'Five working days, one hot meal per head, fixed budget.',
        status: 'draft',
        start_date: planStart,
        end_date: planEnd,
        headcount: faker.number.int({ min: 80, max: 900 }),
        // Sized against the demo catalog: three components at 18-95 SAR each.
        budget_per_meal: money(115, 165),
        currency: CURRENCY,
        pricing_list_id: pricingListId,
        source_menu_id: menuId,
        min_calories_kcal: '650.00',
        max_calories_kcal: '1250.00',
        min_protein_g: '40.00',
        max_carbs_g: '140.00',
        max_fat_g: '55.00',
        slot_spec: [
          { componentType: 'protein', quantity: 1 },
          { componentType: 'carb', quantity: 1 },
          { componentType: 'salad', quantity: 1 },
        ] as Prisma.InputJsonValue,
        exclude_allergens: faker.helpers.arrayElement([[], ['nuts'], ['gluten']]),
        variety_window_days: 2,
      },
    });

    for (let o = 0; o < ORDERS_PER_COMPANY; o++) {
      const lineCount = faker.number.int({ min: 1, max: 4 });
      const chosen = faker.helpers.arrayElements(products, Math.min(lineCount, products.length));
      let subtotal = 0;
      const items = chosen.map((p) => {
        const qty = faker.number.int({ min: 1, max: 5 });
        const unit = Number(p.price);
        const line = unit * qty;
        subtotal += line;
        return {
          product_id: p.id,
          product_name_snapshot: p.name,
          unit_price_snapshot: p.price,
          quantity: qty,
          line_total: line.toFixed(2),
        };
      });
      const tax = Number((subtotal * 0.15).toFixed(2));
      const total = Number((subtotal + tax).toFixed(2));
      const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${faker.string.alphanumeric(6).toUpperCase()}`;

      let workflowInstanceId: string | undefined;
      if (workflow && submittedStepId) {
        const placeholderEntityId = faker.string.uuid();
        const instance = await prisma.entityWorkflowInstance.create({
          data: {
            workflow_id: workflow.id,
            entity_type: 'order',
            entity_id: placeholderEntityId,
            current_step_id: submittedStepId,
            entered_step_at: new Date(),
          },
        });
        workflowInstanceId = instance.id;
      }

      const order = await prisma.order.create({
        data: {
          company_id: company.id,
          ordered_by_user_id: user.id,
          order_number: orderNumber,
          workflow_instance_id: workflowInstanceId ?? null,
          currency: CURRENCY,
          subtotal_amount: subtotal.toFixed(2),
          tax_amount: tax.toFixed(2),
          total_amount: total.toFixed(2),
          requested_delivery_at: faker.date.soon({ days: 5 }),
          delivery_address_id: address.id,
          fulfillment_type: faker.helpers.arrayElement(['pickup', 'delivery'] as const),
          source_channel: faker.helpers.arrayElement(['web', 'mobile', 'api']),
          items: { create: items },
          status_history: {
            create: {
              status_code: 'submitted',
              changed_at: new Date(),
              changed_by: user.id,
              comment: 'Order placed (demo seed)',
            },
          },
          notes: {
            create: {
              note: faker.helpers.arrayElement([
                'Please pack separately for meeting rooms.',
                'No onions on any items.',
                'Call reception on arrival.',
              ]),
              is_internal: false,
              author_type: 'company_user',
              author_id: user.id,
            },
          },
        },
      });

      if (workflowInstanceId) {
        await prisma.entityWorkflowInstance.update({
          where: { id: workflowInstanceId },
          data: { entity_id: order.id },
        });
      }
    }
  }

  console.log(`  ${COMPANY_COUNT} companies, ~${COMPANY_COUNT * ORDERS_PER_COMPANY} orders`);
  return companyCreds;
}

async function main() {
  console.log(`Realistic demo seed (faker seed=${SEED})`);
  await wipeTransactionalData();
  const pricing = await ensureDefaultPricingList();
  await seedStableTestFixtures(pricing.id);
  const catalog = await seedRealisticCatalog(pricing.id);
  const menu = await seedMenus(catalog.createdCategories, catalog.createdProducts);
  const allProducts = [
    { id: SEED_PRODUCT_ID, name: 'Herb Roasted Chicken Plate', price: '48.00' },
    ...catalog.createdProducts,
  ];
  const creds = await seedCompaniesAndOrders(menu.id, pricing.id, allProducts);

  console.log('\n✅ Demo data ready');
  console.log(`  catalog products: ${catalog.createdProducts.length} + 1 fixture`);
  console.log(`  menu: ${menu.name} (${menu.id})`);
  console.log('\nCompany logins (password for all: SecurePass123!):');
  for (const c of creds) {
    console.log(`  - ${c.legalName}`);
    console.log(`      ${c.userEmail}`);
  }
  console.log('\nDashboard: admin@cloudkitchen.example / Admin@12345');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
