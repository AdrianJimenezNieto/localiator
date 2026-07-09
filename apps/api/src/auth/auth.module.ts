import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

// PrismaModule es global (ver prisma.module.ts), por eso no hace falta importarlo.
// MailModule sí se importa para inyectar MailService en AuthService.
@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  exports: [PasswordService],
})
export class AuthModule {}
