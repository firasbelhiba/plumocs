import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

/**
 * PrismaModule, WorkspaceModule and AuditModule are @Global, so only the two
 * non-global dependencies are named here:
 *
 *   AuthModule  — for JwtService, to mint the session an accepted invitation
 *                 returns. AuthModule exports JwtModule; registering a second
 *                 JwtModule here would be a second place the signing secrets are
 *                 configured, and the two would drift.
 *   EmailModule — for EmailService.sendInvitation.
 *
 * Neither imports this module, so there is no cycle.
 */
@Module({
  imports: [AuthModule, EmailModule],
  providers: [InvitationsService],
  controllers: [InvitationsController],
  exports: [InvitationsService],
})
export class InvitationsModule {}
