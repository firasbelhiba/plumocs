import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { WorkspaceModule } from './common/workspace/workspace.module';
import { QueueModule } from './queue/queue.module';
import { AuditModule } from './audit/audit.module';
import { EmailModule } from './email/email.module';
import { RealtimeService } from './realtime/realtime.service';
import {
  EmailInboundProcessor,
  EmailOutboundProcessor,
  ExportDailyProcessor,
  NotificationsFanoutProcessor,
  SearchIndexProcessor,
  SlaSweepProcessor,
  WebhookDeliverProcessor,
} from './worker-jobs/processors';

/** Lean module for the worker process: no controllers, no HTTP guards. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    WorkspaceModule, // the worker has no principal — this is how jobs find tenants
    QueueModule,
    AuditModule, // global modules still need one root registration
    EmailModule,
  ],
  providers: [
    RealtimeService,
    EmailOutboundProcessor,
    EmailInboundProcessor,
    WebhookDeliverProcessor,
    SlaSweepProcessor,
    SearchIndexProcessor,
    NotificationsFanoutProcessor,
    ExportDailyProcessor,
  ],
})
export class WorkerModule {}
