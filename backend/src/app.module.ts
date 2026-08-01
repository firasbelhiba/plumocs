import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CustomersModule } from './customers/customers.module';
import { TicketsModule } from './tickets/tickets.module';
import { ChatModule } from './chat/chat.module';
import { MessagesModule } from './messages/messages.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { SlaModule } from './sla/sla.module';
import { TagsModule } from './tags/tags.module';
import { CannedResponsesModule } from './canned-responses/canned-responses.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { EmailModule } from './email/email.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { ReportsModule } from './reports/reports.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logLevel'),
          genReqId: (req: { headers: Record<string, string | string[] | undefined> }) =>
            (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
          transport: config.get('nodeEnv') === 'development' ? { target: 'pino-pretty' } : undefined,
          redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('rateLimit.windowSecs') ?? 60) * 1_000,
            limit: config.get<number>('rateLimit.max') ?? 120,
          },
        ],
      }),
    }),
    PrismaModule,
    QueueModule,
    AuditModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    OrganizationsModule,
    CustomersModule,
    TicketsModule,
    ChatModule,
    MessagesModule,
    AttachmentsModule,
    SlaModule,
    TagsModule,
    CannedResponsesModule,
    WebhooksModule,
    ApiKeysModule,
    EmailModule,
    NotificationsModule,
    SearchModule,
    ReportsModule,
    IntegrationsModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [
    // §8.6 order: throttle → authenticate → role/scope gate
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
