import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { getRequestActor } from '../core/middleware/requestContext';

export interface RecordTimelineEventParams {
  entityType: string;
  entityId: string;
  eventCode: string;
  comment?: string;
  metadata?: Record<string, unknown>;
  actorType?: string;
  actorId?: string;
  source?: string;
}

export const timelineService = {
  async recordTimelineEvent(params: RecordTimelineEventParams) {
    const actor = getRequestActor();

    const row = await prisma.timelineEvent.create({
      data: {
        entity_type: params.entityType,
        entity_id: params.entityId,
        event_code: params.eventCode,
        actor_type: params.actorType ?? actor?.type ?? 'system',
        actor_id: params.actorId ?? actor?.id ?? null,
        source: params.source ?? 'api',
        comment: params.comment ?? null,
        metadata:
          params.metadata === undefined ? Prisma.JsonNull : (params.metadata as Prisma.InputJsonValue),
      },
    });

    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      eventCode: row.event_code,
      actorType: row.actor_type,
      actorId: row.actor_id,
      source: row.source,
      comment: row.comment,
      metadata: row.metadata,
      occurredAt: row.occurred_at.toISOString(),
    };
  },

  async listTimelineEvents(entityType: string, entityId: string) {
    const rows = await prisma.timelineEvent.findMany({
      where: { entity_type: entityType, entity_id: entityId },
      orderBy: { occurred_at: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      eventCode: row.event_code,
      actorType: row.actor_type,
      actorId: row.actor_id,
      source: row.source,
      comment: row.comment,
      metadata: row.metadata,
      occurredAt: row.occurred_at.toISOString(),
    }));
  },
};
