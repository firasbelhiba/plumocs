import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService],
  controllers: [AuthController],
  // AuthService is exported so other modules can issue a session without
  // reimplementing token minting. PmIdentityModule needs it for sign-in with
  // Plumo; a second copy of that logic would drift from this one.
  // AuthService is exported so other modules can issue a session without
  // reimplementing token minting. PmIdentityModule needs it for sign-in with
  // Plumo; a second copy of that logic would drift from this one.
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
