import app from './app';
import { config } from './config';
import { logger } from './core/utils/logger';
import { prisma } from './prisma/client';

const PORT = config.PORT;

async function bootstrap(): Promise<void> {
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: config.NODE_ENV }, 'Cloud Kitchen B2B API running');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
