import { Response } from 'express';
import { getCorrelationId } from '../middleware/requestContext';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
}

export interface ResponseMeta {
  correlationId: string;
  pagination?: PaginationMeta;
}

function buildMeta(extra?: Partial<ResponseMeta>): ResponseMeta {
  return {
    correlationId: getCorrelationId() ?? 'unknown',
    ...extra,
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Partial<ResponseMeta>,
): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: buildMeta(meta),
  });
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number,
  details?: unknown,
): Response {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    meta: buildMeta(),
  });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
): Response {
  return res.status(200).json({
    success: true,
    data,
    meta: buildMeta({ pagination }),
  });
}
