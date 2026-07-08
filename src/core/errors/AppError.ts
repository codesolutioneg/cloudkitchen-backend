import { ErrorCode, ErrorCodes } from './errorCodes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: ErrorCode, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, ErrorCodes.BAD_REQUEST, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, ErrorCodes.VALIDATION_ERROR, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code: ErrorCode = ErrorCodes.UNAUTHORIZED) {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code: ErrorCode = ErrorCodes.FORBIDDEN) {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', code: ErrorCode = ErrorCodes.NOT_FOUND) {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, 409, ErrorCodes.CONFLICT, details);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(message, 500, ErrorCodes.INTERNAL_ERROR, details);
  }
}
