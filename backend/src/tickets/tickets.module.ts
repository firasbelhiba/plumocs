import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { SlaModule } from '../sla/sla.module';
import { CustomersModule } from '../customers/customers.module';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TeamScopeService } from '../common/guards/team-scope.service';

@Module({
  imports: [SlaModule, CustomersModule, MessagesModule, RealtimeModule],
  providers: [TicketsService, TeamScopeService],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
