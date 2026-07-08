import { RequestHandler } from 'express';
import { getRequestActor, setRequestActor } from './requestContext';
import { UnauthorizedError } from '../errors/AppError';
import { resolveActorFromBearer } from './companyAuthMiddleware';

export const requireAnyAuthMiddleware: RequestHandler = (req, _res, next) => {
  let actor = getRequestActor();
  if (!actor) {
    actor = resolveActorFromBearer(req.headers.authorization);
    if (actor) {
      setRequestActor(actor);
    }
  }

  if (!actor || (actor.type !== 'company_user' && actor.type !== 'dashboard_user')) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  req.actor = actor;
  next();
};
