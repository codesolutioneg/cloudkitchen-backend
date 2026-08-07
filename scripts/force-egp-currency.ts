import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EGP = 'EGP';

async function main() {
  await prisma.globalSetting.upsert({
    where: { setting_key: 'business.default_currency' },
    update: {
      setting_value: EGP,
      is_overridable: true,
      description: 'Platform currency is EGP only',
    },
    create: {
      setting_key: 'business.default_currency',
      setting_value: EGP,
      is_overridable: true,
      description: 'Platform currency is EGP only',
    },
  });

  await prisma.globalSetting.upsert({
    where: { setting_key: 'business.default_timezone' },
    update: { setting_value: 'Africa/Cairo', is_overridable: true },
    create: {
      setting_key: 'business.default_timezone',
      setting_value: 'Africa/Cairo',
      is_overridable: true,
      description: 'Default timezone for scheduling and reports',
    },
  });

  await prisma.globalSetting.upsert({
    where: { setting_key: 'business.default_language' },
    update: { setting_value: 'ar', is_overridable: true },
    create: {
      setting_key: 'business.default_language',
      setting_value: 'ar',
      is_overridable: true,
      description: 'Default language code for the platform',
    },
  });

  const products = await prisma.product.updateMany({
    where: { currency: { not: EGP } },
    data: { currency: EGP },
  });
  const orders = await prisma.order.updateMany({
    where: { currency: { not: EGP } },
    data: { currency: EGP },
  });
  const lists = await prisma.productPricingList.updateMany({
    where: { currency: { not: EGP } },
    data: { currency: EGP, name: 'Default EGP' },
  });
  const companies = await prisma.company.updateMany({
    where: { default_currency: { not: EGP } },
    data: { default_currency: EGP },
  });

  console.log({
    setting: EGP,
    products: products.count,
    orders: orders.count,
    pricingLists: lists.count,
    companies: companies.count,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
