import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { BadRequestError, NotFoundError } from '../../core/errors/AppError';

function serializeJob(row: {
  id: string;
  job_type: string;
  status: string;
  queue_name: string;
  retry_count: number;
  max_retries: number;
  created_at?: Date;
  scheduled_at: Date;
}) {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    queueName: row.queue_name,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    createdAt: (row.created_at ?? row.scheduled_at).toISOString(),
  };
}

function serializeJobDetail(row: {
  id: string;
  job_type: string;
  status: string;
  queue_name: string;
  payload: Prisma.JsonValue;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  scheduled_at: Date;
}) {
  return {
    ...serializeJob(row),
    payload: row.payload,
    lastError: row.last_error,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
  };
}

export async function listJobs(query: {
  status?: string;
  jobType?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 20, 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.BackgroundJobWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.jobType ? { job_type: query.jobType } : {}),
  };

  const [items, totalItems] = await prisma.$transaction([
    prisma.backgroundJob.findMany({
      where,
      orderBy: { scheduled_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.backgroundJob.count({ where }),
  ]);

  return {
    items: items.map(serializeJob),
    pagination: { page, pageSize, totalItems },
  };
}

export async function getJob(jobId: string) {
  const row = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!row) {
    throw new NotFoundError('Job not found');
  }
  return serializeJobDetail(row);
}

export async function retryJob(jobId: string) {
  const row = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!row) {
    throw new NotFoundError('Job not found');
  }
  if (row.status !== 'failed' && row.status !== 'retrying') {
    throw new BadRequestError('Only failed jobs can be retried');
  }

  const updated = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: 'pending',
      scheduled_at: new Date(),
      last_error: null,
    },
  });
  return serializeJob(updated);
}

export async function cancelJob(jobId: string) {
  const row = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!row) {
    throw new NotFoundError('Job not found');
  }
  if (row.status !== 'pending' && row.status !== 'retrying') {
    throw new BadRequestError('Only pending jobs can be cancelled');
  }

  const updated = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: 'cancelled', completed_at: new Date() },
  });
  return serializeJob(updated);
}
