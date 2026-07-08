import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { getCorrelationId, getRequestActor } from '../core/middleware/requestContext';

export interface EnqueueJobInput {
  jobType: string;
  payload: Prisma.InputJsonValue;
  queueName?: string;
  priority?: number;
  scheduledAt?: Date;
  maxRetries?: number;
}

export async function enqueueJob(input: EnqueueJobInput): Promise<string> {
  const actor = getRequestActor();
  const job = await prisma.backgroundJob.create({
    data: {
      job_type: input.jobType,
      payload: input.payload,
      queue_name: input.queueName ?? 'default',
      priority: input.priority ?? 0,
      scheduled_at: input.scheduledAt ?? new Date(),
      max_retries: input.maxRetries ?? 3,
      correlation_id: getCorrelationId() ?? undefined,
      created_by_type: actor?.type,
      created_by_id: actor?.id,
    },
  });
  return job.id;
}
