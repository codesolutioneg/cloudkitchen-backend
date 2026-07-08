import { RequestHandler } from 'express';
import { setRequestActor } from './requestContext';

/** Test-only: seed actor from headers so Phase 1 routes are testable before Phase 2 JWT auth. */
export const testActorMiddleware: RequestHandler = (req, _res, next) => {
  const companyUserId = req.headers['x-test-company-user-id'];
  const companyId = req.headers['x-test-company-id'];
  if (typeof companyUserId === 'string' && typeof companyId === 'string') {
    setRequestActor({ type: 'company_user', id: companyUserId, companyId });
  }

  const dashboardUserId = req.headers['x-test-dashboard-user-id'];
  if (typeof dashboardUserId === 'string') {
    setRequestActor({ type: 'dashboard_user', id: dashboardUserId });
  }

  next();
};
