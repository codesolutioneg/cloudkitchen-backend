import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../core/utils/logger';
import { handleSendNotification } from './handlers/sendNotification';
import { notificationEngine } from '../engines/notificationEngine';

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 5;

interface ClaimedJob {
  id: string;
  job_type: string;
  payload: Prisma.JsonValue;
  retry_count: number;
  max_retries: number;
}

async function claimJobs(): Promise<ClaimedJob[]> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedJob[]>`
      SELECT id, job_type, payload, retry_count, max_retries
      FROM background_jobs
      WHERE status = 'pending'
        AND scheduled_at <= NOW()
      ORDER BY priority DESC, scheduled_at ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((r) => r.id);
    await tx.backgroundJob.updateMany({
      where: { id: { in: ids } },
      data: { status: 'running', started_at: new Date() },
    });

    return rows;
  });
}

async function completeJob(jobId: string, output?: Prisma.InputJsonValue): Promise<void> {
  await prisma.$transaction([
    prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: 'completed', completed_at: new Date() },
    }),
    prisma.jobExecutionLog.create({
      data: {
        background_job_id: jobId,
        attempt_number: 1,
        status: 'success',
        finished_at: new Date(),
        output: output ?? Prisma.JsonNull,
      },
    }),
  ]);
}

async function failJob(
  job: ClaimedJob,
  errorMessage: string,
): Promise<void> {
  const nextRetry = job.retry_count + 1;
  const shouldRetry = nextRetry < job.max_retries;

  await prisma.$transaction([
    prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: shouldRetry ? 'pending' : 'failed',
        retry_count: nextRetry,
        last_error: errorMessage,
        ...(shouldRetry
          ? { scheduled_at: new Date(Date.now() + 30_000) }
          : { completed_at: new Date() }),
      },
    }),
    prisma.jobExecutionLog.create({
      data: {
        background_job_id: job.id,
        attempt_number: nextRetry,
        status: 'failure',
        finished_at: new Date(),
        error_message: errorMessage,
      },
    }),
  ]);
}

async function processJob(job: ClaimedJob): Promise<void> {
  const payload = job.payload as Record<string, unknown>;

  switch (job.job_type) {
    case 'send_notification':
      await handleSendNotification(payload as { notificationId: string });
      await completeJob(job.id);
      break;

    case 'workflow.notify': {
      const actionConfig = payload.actionConfig as {
        templateCode?: string;
        recipientType?: 'company_user' | 'dashboard_user';
        recipientId?: string;
        languageCode?: string;
      };
      if (actionConfig.templateCode && actionConfig.recipientType && actionConfig.recipientId) {
        await notificationEngine.queueNotification({
          templateCode: actionConfig.templateCode,
          recipientType: actionConfig.recipientType,
          recipientId: actionConfig.recipientId,
          languageCode: actionConfig.languageCode,
          relatedEntityType: payload.entityType as string | undefined,
          relatedEntityId: payload.entityId as string | undefined,
        });
      } else {
        logger.info({ payload }, 'workflow.notify — no template configured, logging only');
      }
      await completeJob(job.id);
      break;
    }

    case 'workflow.webhook':
      logger.info({ payload }, 'workflow.webhook — log only in v1');
      await completeJob(job.id, { logged: true });
      break;

    case 'workflow.escalate':
      logger.info({ payload }, 'workflow.escalate — log only in v1');
      await completeJob(job.id, { logged: true });
      break;

    default:
      logger.warn({ jobType: job.job_type }, 'Unknown job type');
      await completeJob(job.id, { skipped: true });
  }
}

async function pollOnce(): Promise<void> {
  const jobs = await claimJobs();
  for (const job of jobs) {
    try {
      await processJob(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId: job.id, jobType: job.job_type }, 'Job processing failed');
      await failJob(job, message);
    }
  }
}

async function runWorker(): Promise<void> {
  logger.info('Background job worker started');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      logger.error({ err }, 'Worker poll cycle failed');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (require.main === module) {
  runWorker().catch((err) => {
    logger.fatal({ err }, 'Worker crashed');
    process.exit(1);
  });
}

export { pollOnce, runWorker };
