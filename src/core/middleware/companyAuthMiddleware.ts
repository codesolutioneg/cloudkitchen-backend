import { RequestHandler } from 'express';
import {
  extractBearerToken,
  verifyCompanyAccess,
  verifyDashboardAccess,
} from '../utils/jwt';
import { getRequestActor, setRequestActor } from './requestContext';
import { UnauthorizedError } from '../errors/AppError';
import { ErrorCodes } from '../errors/errorCodes';

export function resolveActorFromBearer(authorization?: string) {
  const token = extractBearerToken(authorization);
  if (!token) {
    return undefined;
  }

  try {
    const companyPayload = verifyCompanyAccess(token);
    return {
      type: 'company_user' as const,
      id: companyPayload.sub,
      companyId: companyPayload.companyId,
    };
  } catch {
    // try dashboard
  }

  try {
    const dashboardPayload = verifyDashboardAccess(token);
    return {
      type: 'dashboard_user' as const,
      id: dashboardPayload.sub,
    };
  } catch {
    return undefined;
  }
}

export const companyAuthMiddleware: RequestHandler = (req, _res, next) => {
  let actor = getRequestActor();
  if (!actor) {
    actor = resolveActorFromBearer(req.headers.authorization);
    if (actor) {
      setRequestActor(actor);
    }
  }

  if (actor?.type !== 'company_user' || !actor.companyId) {
    next(new UnauthorizedError('Company authentication required'));
    return;
  }
  req.actor = actor;
  next();
};

export const dashboardAuthMiddleware: RequestHandler = (req, _res, next) => {
  let actor = getRequestActor();
  if (!actor) {
    actor = resolveActorFromBearer(req.headers.authorization);
    if (actor) {
      setRequestActor(actor);
    }
  }

  if (actor?.type !== 'dashboard_user') {
    next(new UnauthorizedError('Dashboard authentication required'));
    return;
  }
  req.actor = actor;
  next();
};

/** Rejects wrong-audience Bearer tokens when present (§7.1). */
export function rejectWrongAudience(expected: 'company' | 'dashboard'): RequestHandler {
  return (req, _res, next) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      next();
      return;
    }

    if (expected === 'company') {
      try {
        verifyDashboardAccess(token);
        next(
          new UnauthorizedError('Dashboard token not allowed on company route', ErrorCodes.TOKEN_INVALID),
        );
        return;
      } catch {
        next();
        return;
      }
    }

    try {
      verifyCompanyAccess(token);
      next(
        new UnauthorizedError('Company token not allowed on dashboard route', ErrorCodes.TOKEN_INVALID),
      );
    } catch {
      next();
    }
  };
}
