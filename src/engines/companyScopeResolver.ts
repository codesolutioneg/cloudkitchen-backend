import { prisma } from '../prisma/client';

export async function getDashboardCompanyScopeFilter(dashboardUserId: string) {
  const scope = await prisma.dashboardUserCompanyScope.findUnique({
    where: { dashboard_user_id: dashboardUserId },
    include: { dashboard_user: true },
  });

  if (!scope || scope.scope_type === 'all') {
    return undefined;
  }

  const assignments = await prisma.dashboardUserCompanyAssignment.findMany({
    where: { dashboard_user_id: dashboardUserId },
    select: { company_id: true },
  });

  const companyIds = assignments.map((a: { company_id: string }) => a.company_id);
  if (companyIds.length === 0) {
    return { id: { in: [] as string[] } };
  }

  return { id: { in: companyIds } };
}
