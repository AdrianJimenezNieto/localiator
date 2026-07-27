import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationTokenType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { generateToken, hashToken } from './crypto.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// Identidad verificada tras un login correcto. NO incluye tokens de sesión: la
// emisión de access/refresh se monta en la tarea 09 y reutilizará este resultado.
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

// Respuesta única del registro. SIEMPRE la misma, exista o no la cuenta, para no
// permitir enumeración de usuarios (averiguar qué emails están registrados
// probando el formulario). Es una decisión de seguridad de CLAUDE.md.
const NEUTRAL_REGISTER_MESSAGE =
  'Si el email es válido, te hemos enviado un correo para verificar tu cuenta.';

const EMAIL_VERIFICATION_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 días
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 h (ventana corta: más seguro)

// Periodo de gracia para iniciar sesión SIN verificar el email: 1 día desde el
// alta. Pasado ese plazo, el login queda bloqueado hasta verificar. Es más corto
// que el TTL del enlace (2 días) a propósito: entre el día 1 y el 2 el usuario no
// puede loguear pero el enlace original sigue valiendo; después, pide otro.
const EMAIL_VERIFICATION_GRACE_MS = 24 * 60 * 60 * 1000; // 1 día

// Igual que en el registro: respuesta única, exista o no la cuenta, para no
// revelar qué emails están registrados (anti-enumeración).
const NEUTRAL_FORGOT_MESSAGE =
  'Si el email corresponde a una cuenta, te hemos enviado un enlace para restablecer la contraseña.';

// Respuesta única del reenvío de verificación: la misma exista la cuenta o no, y
// esté verificada o no, para no filtrar ni la existencia ni el estado de la cuenta.
const NEUTRAL_RESEND_MESSAGE =
  'Si tu cuenta existe y aún no está verificada, te hemos enviado un nuevo enlace de verificación.';

// Mensaje ÚNICO ante cualquier fallo de login (email inexistente, contraseña
// incorrecta, cuenta sin contraseña local): no revelar cuál de los tres falló
// evita la enumeración de usuarios.
const INVALID_CREDENTIALS = 'Credenciales inválidas';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Hash "señuelo" con los MISMOS parámetros de argon2 que los reales. Cuando el
  // email no existe (o el usuario no tiene contraseña local), verificamos igual
  // contra este hash para gastar el mismo tiempo de CPU: así un atacante no puede
  // deducir por el tiempo de respuesta si un email está registrado (ataque de
  // timing). Se calcula una sola vez al arrancar.
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly session: SessionService,
  ) {
    this.dummyHash = this.password.hash(randomBytes(32).toString('hex'));
  }

  async login(dto: LoginDto): Promise<AuthenticatedUser> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Siempre ejecutamos UN verify, exista el usuario o no. Si no hay usuario o no
    // tiene contraseña local (cuenta solo-Google), comparamos contra el señuelo
    // para igualar el tiempo de respuesta.
    const hashToCheck = user?.passwordHash ?? (await this.dummyHash);
    const passwordOk = await this.password.verify(hashToCheck, dto.password);

    if (!user || !user.passwordHash || !passwordOk) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Política: un usuario NO verificado puede iniciar sesión durante un periodo
    // de gracia (1 día desde el alta) para no fastidiar la primera experiencia.
    // Pasado ese plazo, se bloquea el login hasta verificar el email. Aquí el
    // usuario YA ha demostrado la contraseña, así que un mensaje específico no
    // facilita la enumeración de cuentas. El frontend puede ofrecer "reenviar
    // verificación" ante este error.
    if (!user.emailVerifiedAt) {
      const graceExpired =
        user.createdAt.getTime() + EMAIL_VERIFICATION_GRACE_MS < Date.now();
      if (graceExpired) {
        throw new ForbiddenException(
          'Debes verificar tu email antes de iniciar sesión. Revisa tu correo o solicita un nuevo enlace de verificación.',
        );
      }
    }

    // El flag emailVerified viaja al cliente para que la UI lo refleje; la
    // restricción de compra/puja se aplica además en los endpoints de compra.
    return this.toAuthenticatedUser(user);
  }

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
    // los flujos de compra de Fase 3). Junto a las credenciales guardamos los
    // datos personales del registro (identidad, contacto y dirección de
    // facturación); phone y addressLine2 son opcionales.
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerifiedAt: null,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        birthDate: new Date(dto.birthDate), // 'YYYY-MM-DD' → Date (campo @db.Date).
        phone: dto.phone?.trim() || null,
        addressLine1: dto.addressLine1.trim(),
        addressLine2: dto.addressLine2?.trim() || null,
        postalCode: dto.postalCode.trim(),
        city: dto.city.trim(),
        province: dto.province.trim(),
        country: dto.country,
      },
    });

    await this.issueEmailVerification(user.id, email);
    return { message: NEUTRAL_REGISTER_MESSAGE };
  }

  // Resuelve (o crea) el User local a partir de una identidad de Google. Se llama
  // desde GoogleStrategy.validate tras el callback de OAuth.
  //
  // Estrategia de vinculación (account linking):
  //  1. Si ya existe el OAuthAccount (provider, sub) → login directo.
  //  2. Si no, pero hay un User con ese email → se VINCULA (creamos el
  //     OAuthAccount) para no duplicar la cuenta de la misma persona. Es seguro
  //     porque Google ya ha verificado ese email.
  //  3. Si no existe ninguno → creamos User (emailVerifiedAt = now, Google ya lo
  //     verificó) y su OAuthAccount en la misma operación.
  async validateOAuthLogin(input: {
    provider: string;
    providerAccountId: string;
    email: string;
  }): Promise<AuthenticatedUser> {
    const { provider, providerAccountId } = input;
    const email = input.email.toLowerCase().trim();

    const account = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
    if (account) {
      return this.toAuthenticatedUser(account.user);
    }

    const linked = await this.prisma.user.findUnique({ where: { email } });
    if (linked) {
      await this.prisma.oAuthAccount.create({
        data: { provider, providerAccountId, userId: linked.id },
      });
      return this.toAuthenticatedUser(linked);
    }

    // Usuario nuevo: sin contraseña local (passwordHash queda null); podrá
    // establecer una más adelante vía "recuperación de contraseña" (tarea 11).
    const created = await this.prisma.user.create({
      data: {
        email,
        emailVerifiedAt: new Date(),
        oauthAccounts: { create: { provider, providerAccountId } },
      },
    });
    return this.toAuthenticatedUser(created);
  }

  private toAuthenticatedUser(user: {
    id: string;
    email: string;
    role: string;
    emailVerifiedAt: Date | null;
  }): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };
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

  // Reenvía el email de verificación. SIEMPRE responde igual (anti-enumeración):
  // solo si existe una cuenta sin verificar se emite un nuevo token. Reutiliza
  // issueEmailVerification, que genera un token nuevo con su TTL de 2 días. No
  // invalidamos los tokens previos: cada uno es de un solo uso y caduca por su
  // cuenta, así que basta con que el usuario use el más reciente.
  async resendVerification(rawEmail: string): Promise<{ message: string }> {
    const email = rawEmail.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && !user.emailVerifiedAt) {
      await this.issueEmailVerification(user.id, email);
    }

    return { message: NEUTRAL_RESEND_MESSAGE };
  }

  // "Olvidé mi contraseña": SIEMPRE responde igual (exista o no la cuenta). Solo
  // si el usuario existe se genera y envía el token de reseteo.
  async forgotPassword(rawEmail: string): Promise<{ message: string }> {
    const email = rawEmail.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      const { token, tokenHash } = generateToken();
      await this.prisma.verificationToken.create({
        data: {
          userId: user.id,
          type: VerificationTokenType.PASSWORD_RESET,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      const appUrl =
        this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
      const resetUrl = `${appUrl}/restablecer-password?token=${token}`;
      await this.mail.sendPasswordReset(email, resetUrl);
    }

    return { message: NEUTRAL_FORGOT_MESSAGE };
  }

  // Restablece la contraseña con el token del email. Sirve también para que un
  // usuario solo-Google (passwordHash null) ESTABLEZCA una contraseña local por
  // primera vez (el flujo es idéntico).
  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    const invalid =
      !record ||
      record.type !== VerificationTokenType.PASSWORD_RESET ||
      record.usedAt !== null ||
      record.expiresAt < new Date();
    if (invalid) {
      throw new BadRequestException(
        'El enlace de reseteo no es válido o ha caducado',
      );
    }

    const passwordHash = await this.password.hash(newPassword);

    // Actualizar la contraseña e invalidar el token, atómico.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Revocar TODAS las sesiones del usuario: si alguien había robado la cuenta,
    // el cambio de contraseña lo expulsa. Decisión recomendada por el propio 11.
    await this.session.revokeAllForUser(record.userId);

    return { message: 'Contraseña actualizada. Vuelve a iniciar sesión.' };
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
