import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { closeDatabaseConnection, verifyDatabaseConnection } from './db';
import { closeSocketServer, initialiseSocketServer } from './socket';
import { describeStorageProvider } from './services/storage';
import { describeMailProvider } from './services/mail';

async function bootstrap(): Promise<void> {
  await verifyDatabaseConnection();

  const app = createApp();
  const httpServer = createServer(app);

  initialiseSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`RestaurantOS API listening on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Storage provider: ${describeStorageProvider()}`);
    logger.info(`Mail provider: ${describeMailProvider()}`);
    logger.info(`Allowed origins: ${env.corsOrigins.join(', ')}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);

    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out after 10s — forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await closeSocketServer();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      await closeDatabaseConnection();
      clearTimeout(forceExit);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception — exiting', error);
    process.exit(1);
  });
}

void bootstrap().catch((error: unknown) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});
