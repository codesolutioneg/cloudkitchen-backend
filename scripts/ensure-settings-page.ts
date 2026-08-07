import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CURRENCY = process.env.BUSINESS_DEFAULT_CURRENCY ?? 'EGP';

async function main() {
  let page = await prisma.dashboardPage.findFirst({ where: { route: '/dashboard/settings' } });
  if (!page) {
    page = await prisma.dashboardPage.create({
      data: {
        name: 'Settings',
        route: '/dashboard/settings',
        sort_order: 100,
        icon: 'Settings2',
        is_enabled: true,
        is_visible: true,
      },
    });
    console.log('created settings page', page.id);
  } else {
    page = await prisma.dashboardPage.update({
      where: { id: page.id },
      data: {
        name: 'Settings',
        sort_order: 100,
        icon: 'Settings2',
        is_enabled: true,
        is_visible: true,
      },
    });
    console.log('updated settings page', page.id);
  }

  const roles = await prisma.role.findMany({
    where: { name: { in: ['Super Admin', 'Admin'] } },
  });
  for (const role of roles) {
    await prisma.rolePagePermission.upsert({
      where: { role_id_page_id: { role_id: role.id, page_id: page.id } },
      update: { can_view: true, can_edit: true, can_create: true, can_delete: true },
      create: {
        role_id: role.id,
        page_id: page.id,
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
        can_approve: true,
        can_reject: true,
        can_export: true,
        can_import: true,
      },
    });
    console.log('permission for', role.name);
  }

  const settings = [
    {
      key: 'business.default_currency',
      value: CURRENCY,
      desc: 'Default currency (ISO 4217) for new products, pricing lists, and display',
    },
    {
      key: 'business.default_timezone',
      value: process.env.BUSINESS_DEFAULT_TIMEZONE ?? 'Asia/Riyadh',
      desc: 'Default timezone for scheduling and reports',
    },
    {
      key: 'business.default_language',
      value: process.env.BUSINESS_DEFAULT_LANGUAGE ?? 'en',
      desc: 'Default language code for the platform',
    },
  ];

  for (const s of settings) {
    await prisma.globalSetting.upsert({
      where: { setting_key: s.key },
      update: { description: s.desc, is_overridable: true },
      create: {
        setting_key: s.key,
        setting_value: s.value,
        is_overridable: true,
        description: s.desc,
      },
    });
    console.log('upserted', s.key);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
