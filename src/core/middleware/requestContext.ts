import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { RequestHandler } from 'express';

export interface RequestActor {
  type: 'company_user' | 'dashboard_user';
  id: string;
  companyId?: string;
}

interface RequestContextStore {
  actor?: RequestActor;
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  const correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ??
    (req.headers['x-request-id'] as string | undefined) ??
    randomUUID();

  res.setHeader('X-Correlation-Id', correlationId);

  storage.run({ correlationId }, next);
};

export function setRequestActor(actor: RequestActor): void {
  const ctx = storage.getStore();
  if (ctx) {
    ctx.actor = actor;
  }
}

export function getRequestActor(): RequestActor | undefined {
  return storage.getStore()?.actor;
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
