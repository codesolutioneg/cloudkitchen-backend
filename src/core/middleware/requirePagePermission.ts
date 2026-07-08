import { RequestHandler } from 'express';
import { permissionResolver, PageAction } from '../../engines/permissionResolver';
import { ForbiddenError } from '../errors/AppError';

export function requirePagePermission(pageRoute: string, action: PageAction): RequestHandler {
  return async (req, _res, next) => {
    if (req.actor?.type !== 'dashboard_user') {
      next(new ForbiddenError('Dashboard authentication required'));
      return;
    }

    const allowed = await permissionResolver.canAsync(req.actor.id, pageRoute, action);
    if (!allowed) {
      next(new ForbiddenError(`Missing '${action}' on '${pageRoute}'`));
      return;
    }
    next();
  };
}

export function requirePermissionCode(code: string): RequestHandler {
  return async (req, _res, next) => {
    if (req.actor?.type !== 'dashboard_user') {
      next(new ForbiddenError('Dashboard authentication required'));
      return;
    }

    const allowed = await permissionResolver.hasPermissionCode(req.actor.id, code);
    if (!allowed) {
      next(new ForbiddenError(`Missing permission '${code}'`));
      return;
    }
    next();
  };
}
