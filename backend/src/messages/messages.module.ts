import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { TeamScopeService } from '../common/guards/team-scope.service';

@Module({
  imports: [RealtimeModule],
  providers: [MessagesService, TeamScopeService],
  exports: [MessagesService],
})
export class MessagesModule {}
