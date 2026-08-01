import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
