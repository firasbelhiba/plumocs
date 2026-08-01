import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { WorkerModule } from './worker.module';
import { QUEUES } from './queue/queue.constants';

/**
 * Worker bootstrap (BullMQ processors) — same codebase, second entrypoint.
 * Runs no HTTP server; consumes the Redis-backed queues and registers the
 * repeatable jobs (sla.sweep every minute, export.daily nightly).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: false });
  const logger = new Logger('Worker');

  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  // repeatable jobs
  const slaQueue = new Queue(QUEUES.SLA_SWEEP, { connection: { url: redisUrl } });
  await slaQueue.upsertJobScheduler('sla-sweep-every-minute', { pattern: '* * * * *' }, { name: 'sweep' });

  const exportQueue = new Queue(QUEUES.EXPORT_DAILY, { connection: { url: redisUrl } });
  await exportQueue.upsertJobScheduler('export-nightly', { pattern: '15 2 * * *' }, { name: 'run' });

  logger.log('Worker up — consuming queues: ' + Object.values(QUEUES).join(', '));
  await app.init();

  const shutdown = async () => {
    logger.log('Worker shutting down…');
    await Promise.allSettled([slaQueue.close(), exportQueue.close(), app.close()]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
