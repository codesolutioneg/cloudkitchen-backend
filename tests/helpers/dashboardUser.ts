import { PrismaClient } from '@prisma/client';

const TEST_DASHBOARD_USER_EMAIL = 'vitest-dashboard@example.com';

export async function getTestDashboardUserId(): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.dashboardUser.findUniqueOrThrow({
      where: { email: TEST_DASHBOARD_USER_EMAIL },
      select: { id: true },
    });
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}
