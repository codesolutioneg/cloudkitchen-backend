import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from './AppError';
import { logger } from '../utils/logger';
import { ErrorCodes } from './errorCodes';
import { getCorrelationId } from '../middleware/requestContext';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = getCorrelationId() ?? 'unknown';

  if (err instanceof ZodError) {
    const ve = new ValidationError('Validation failed', err.errors);
    res.status(ve.statusCode).json({
      success: false,
      error: { code: ve.code, message: ve.message, details: ve.details },
      meta: { correlationId },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, correlationId }, err.message);
    } else {
      logger.warn({ code: err.code, correlationId }, err.message);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
      meta: { correlationId },
    });
    return;
  }

  logger.error({ err, correlationId }, 'Unhandled error');

  res.status(500).json({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message:
        process.env.NODE_ENV === 'production' ? 'Internal server error' : String(err),
    },
    meta: { correlationId },
  });
}
