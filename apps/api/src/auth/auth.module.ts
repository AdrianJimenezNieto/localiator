import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { GoogleStrategy } from './google.strategy';

// PrismaModule es global (ver prisma.module.ts), por eso no hace falta importarlo.
// MailModule sí se importa para inyectar MailService en AuthService.
// PassportModule habilita las estrategias (Google) usadas por AuthGuard.
@Module({
  imports: [MailModule, PassportModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, GoogleStrategy],
  exports: [PasswordService],
})
export class AuthModule {}
