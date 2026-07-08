import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './core/utils/logger';
import { globalRateLimiter } from './core/middleware/rateLimiter';
import { requestContextMiddleware } from './core/middleware/requestContext';
import { testActorMiddleware } from './core/middleware/testActorMiddleware';
import { errorHandler } from './core/errors/errorHandler';
import { NotFoundError } from './core/errors/AppError';
import { setupOpenApi } from './core/openapi/setup';
import apiRouter from './routes/index';

const app = express();

app.use(helmet());

const allowedOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(hpp());

app.use(requestContextMiddleware);

if (process.env.VITEST === 'true' || config.NODE_ENV === 'test') {
  app.use(testActorMiddleware);
}

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => {
      const header = req.headers['x-correlation-id'] ?? req.headers['x-request-id'];
      return typeof header === 'string' ? header : randomUUID();
    },
    customLogLevel: (_req, res) =>
      res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
  }),
);

app.use(globalRateLimiter);

const uploadsDir = path.resolve(config.UPLOAD_PATH);
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', immutable: true }));

setupOpenApi(app);

app.use('/api', apiRouter);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError('Route not found'));
});

app.use(errorHandler);

export default app;
