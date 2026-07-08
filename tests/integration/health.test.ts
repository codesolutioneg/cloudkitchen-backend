import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app';

describe('GET /api/v1/health', () => {
  it('returns 200 with ok status in the standard envelope', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok' },
      meta: {
        correlationId: expect.any(String),
      },
    });
    expect(res.headers['x-correlation-id']).toBeDefined();
  });
});
