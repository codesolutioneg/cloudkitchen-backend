import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../../src/core/errors/AppError';
import { ErrorCodes } from '../../src/core/errors/errorCodes';
import { errorHandler } from '../../src/core/errors/errorHandler';
import type { Request, Response, NextFunction } from 'express';

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

describe('errorHandler', () => {
  const next = (() => undefined) as NextFunction;

  it('maps AppError to the standard failure envelope', () => {
    const req = {} as Request;
    const res = createMockResponse();
    const err = new AppError('Not allowed', 403, ErrorCodes.FORBIDDEN);

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: ErrorCodes.FORBIDDEN,
        message: 'Not allowed',
      },
      meta: {
        correlationId: expect.any(String),
      },
    });
  });

  it('maps ZodError to VALIDATION_ERROR with 422', () => {
    const req = {} as Request;
    const res = createMockResponse();
    const zodErr = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string',
      },
    ]);

    errorHandler(zodErr, req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
      },
    });
  });

  it('maps ValidationError subclass with details', () => {
    const req = {} as Request;
    const res = createMockResponse();
    const details = [{ field: 'email', issue: 'invalid' }];
    const err = new ValidationError('Validation failed', details);

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        details,
      },
    });
  });
});
