import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUES, DEFAULT_JOB_OPTS } from './queue.constants';
import { QueueProducer } from './queue.producer';

const queues = Object.values(QUEUES).map((name) => BullModule.registerQueue({ name }));

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redisUrl') },
        defaultJobOptions: DEFAULT_JOB_OPTS,
      }),
    }),
    ...queues,
  ],
  providers: [QueueProducer],
  exports: [BullModule, QueueProducer],
})
export class QueueModule {}
