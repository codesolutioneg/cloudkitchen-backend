import type { RequestActor } from '../core/middleware/requestContext';

declare global {
  namespace Express {
    interface Request {
      actor?: RequestActor;
    }
  }
}

export {};
