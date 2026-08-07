/**
 * Provisions the Meal Plans dashboard page and its role permissions.
 *
 * The full seed is not safe to run against a live database, so page rows added
 * after go-live are provisioned by a targeted idempotent script. Mirrors
 * ensure-settings-page.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROUTE = '/dashboard/meal-plans';

const FULL_ACCESS = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: true,
  can_approve: true,
  can_reject: true,
  can_export: true,
  can_import: true,
};

async function main() {
  const attributes = {
    name: 'Meal Plans',
    sort_order: 65,
    icon: 'Salad',
    is_enabled: true,
    is_visible: true,
  };

  const existing = await prisma.dashboardPage.findFirst({ where: { route: ROUTE } });
  const page = existing
    ? await prisma.dashboardPage.update({ where: { id: existing.id }, data: attributes })
    : await prisma.dashboardPage.create({ data: { ...attributes, route: ROUTE } });
  console.log(`${existing ? 'updated' : 'created'} meal plans page ${page.id}`);

  // Sales builds the brief with the client; Operations owns approving it.
  const grants: Array<{ role: string; permissions: Record<string, boolean> }> = [
    { role: 'Super Admin', permissions: FULL_ACCESS },
    { role: 'Admin', permissions: FULL_ACCESS },
    {
      role: 'Sales',
      permissions: { can_view: true, can_create: true, can_edit: true },
    },
    {
      role: 'Operations',
      permissions: { can_view: true, can_create: true, can_edit: true, can_approve: true },
    },
  ];

  for (const grant of grants) {
    const role = await prisma.role.findFirst({ where: { name: grant.role } });
    if (!role) {
      console.log(`skipped ${grant.role}: role not present`);
      continue;
    }
    await prisma.rolePagePermission.upsert({
      where: { role_id_page_id: { role_id: role.id, page_id: page.id } },
      update: grant.permissions,
      create: { role_id: role.id, page_id: page.id, ...grant.permissions },
    });
    console.log(`permission for ${grant.role}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
