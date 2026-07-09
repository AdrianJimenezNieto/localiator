import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { GoogleStrategy } from './google.strategy';
import { SessionService } from './session.service';
import { SessionCleanupService } from './session-cleanup.service';
import { JwtStrategy } from './jwt.strategy';

// PrismaModule y ConfigModule son globales, por eso no hace falta importarlos.
// MailModule → MailService; PassportModule → estrategias (Google/JWT); JwtModule
// firma los access tokens con el secreto de .env.
@Module({
  imports: [
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-insecure-secret',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    GoogleStrategy,
    SessionService,
    SessionCleanupService,
    JwtStrategy,
  ],
  exports: [PasswordService, SessionService],
})
export class AuthModule {}
