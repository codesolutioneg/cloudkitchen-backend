import cron from 'node-cron';
import { prisma } from '../prisma/client';
import { logger } from '../core/utils/logger';
import { enqueueJob } from './jobQueue';

async function tickSchedules(): Promise<void> {
  const schedules = await prisma.jobSchedule.findMany({
    where: { is_active: true },
  });

  const now = new Date();

  for (const schedule of schedules) {
    if (schedule.next_run_at && schedule.next_run_at > now) {
      continue;
    }

    try {
      await enqueueJob({
        jobType: schedule.job_type,
        payload: (schedule.default_payload as object) ?? {},
        queueName: 'scheduled',
      });

      await prisma.jobSchedule.update({
        where: { id: schedule.id },
        data: { last_run_at: now, next_run_at: new Date(now.getTime() + 60_000) },
      });

      logger.info({ jobType: schedule.job_type, scheduleId: schedule.id }, 'Scheduled job enqueued');
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, 'Failed to enqueue scheduled job');
    }
  }
}

function startScheduler(): void {
  logger.info('Job scheduler started');
  cron.schedule('* * * * *', () => {
    void tickSchedules();
  });
}

if (require.main === module) {
  startScheduler();
}

export { startScheduler, tickSchedules };
