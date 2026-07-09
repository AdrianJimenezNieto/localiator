import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationTokenType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordService } from './password.service';
import { generateToken, hashToken } from './crypto.util';
import { RegisterDto } from './dto/register.dto';

// Respuesta única del registro. SIEMPRE la misma, exista o no la cuenta, para no
// permitir enumeración de usuarios (averiguar qué emails están registrados
// probando el formulario). Es una decisión de seguridad de CLAUDE.md.
const NEUTRAL_REGISTER_MESSAGE =
  'Si el email es válido, te hemos enviado un correo para verificar tu cuenta.';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // No creamos nada ni revelamos que ya existe: devolvemos la MISMA respuesta
      // neutra. (Opcional a futuro: enviar un email de "ya tienes cuenta".)
      return { message: NEUTRAL_REGISTER_MESSAGE };
    }

    const passwordHash = await this.password.hash(dto.password);
    // emailVerifiedAt queda null: la cuenta existe pero no está verificada. Podrá
    // loguear (07) pero no comprar/pujar hasta verificar (política a aplicar en
    // los flujos de compra de Fase 3).
    const user = await this.prisma.user.create({
      data: { email, passwordHash, emailVerifiedAt: null },
    });

    await this.issueEmailVerification(user.id, email);
    return { message: NEUTRAL_REGISTER_MESSAGE };
  }

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    // Un solo mensaje de error genérico para token inexistente, caducado o ya
    // usado: no damos pistas sobre por qué falla.
    const invalid =
      !record ||
      record.type !== VerificationTokenType.EMAIL_VERIFICATION ||
      record.usedAt !== null ||
      record.expiresAt < new Date();
    if (invalid) {
      throw new BadRequestException(
        'El enlace de verificación no es válido o ha caducado',
      );
    }

    // Marcamos la cuenta como verificada e invalidamos el token en la MISMA
    // transacción: o se aplican ambos cambios o ninguno (atomicidad). Evita que un
    // fallo intermedio deje el token gastado sin verificar, o al revés.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      message: 'Email verificado correctamente. Ya puedes iniciar sesión.',
    };
  }

  // Genera un token, guarda SOLO su hash y envía el email con el token en claro
  // dentro del enlace. Reutilizable desde el reenvío de verificación.
  private async issueEmailVerification(
    userId: string,
    email: string,
  ): Promise<void> {
    const { token, tokenHash } = generateToken();
    await this.prisma.verificationToken.create({
      data: {
        userId,
        type: VerificationTokenType.EMAIL_VERIFICATION,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    const appUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
    const verifyUrl = `${appUrl}/verificar-email?token=${token}`;
    await this.mail.sendEmailVerification(email, verifyUrl);
  }
}
