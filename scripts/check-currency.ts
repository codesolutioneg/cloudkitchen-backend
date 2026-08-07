import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const rows = await p.globalSetting.findMany({
    where: { setting_key: { startsWith: 'business.' } },
  });
  for (const r of rows) {
    console.log(r.setting_key, typeof r.setting_value, JSON.stringify(r.setting_value));
  }
  const products = await p.product.groupBy({ by: ['currency'], _count: true });
  console.log('product currencies', products);
  const orders = await p.order.groupBy({ by: ['currency'], _count: true });
  console.log('order currencies', orders);
  const lists = await p.pricingList.groupBy({ by: ['currency'], _count: true });
  console.log('pricing currencies', lists);
  const companies = await p.company.groupBy({ by: ['default_currency'], _count: true });
  console.log('company currencies', companies);
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
