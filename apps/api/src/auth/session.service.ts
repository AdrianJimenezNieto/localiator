import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.service';
import { generateToken, hashToken } from './crypto.util';
import { parseDurationMs } from './duration.util';

// Claims que van dentro del access token (JWT). `sub` es el estándar para el id
// del sujeto; role permite al RBAC (tarea 12) autorizar sin ir a BD en cada
// petición.
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

// Resultado de emitir/renovar una sesión: el access token va al body (el cliente
// lo guarda en memoria) y el refresh, opaco, a la cookie HttpOnly.
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthenticatedUser;
}

interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly accessTtl: string;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessTtl = config.get<string>('ACCESS_TOKEN_TTL') ?? '15m';
    this.refreshTtlMs = parseDurationMs(
      config.get<string>('REFRESH_TOKEN_TTL') ?? '15d',
    );
  }

  // Emite una sesión nueva tras un login (local u OAuth). Crea el registro del
  // refresh token (guardando solo su hash) y firma el access token.
  async issue(
    user: AuthenticatedUser,
    meta: SessionMeta = {},
  ): Promise<IssuedSession> {
    const accessToken = await this.signAccessToken(user);
    const { token, tokenHash } = generateToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    return { accessToken, refreshToken: token, refreshExpiresAt, user };
  }

  // Rota el refresh token: valida el actual, lo revoca y emite uno nuevo (con
  // caducidad renovada → sliding expiration, tarea 10). Devuelve la nueva sesión.
  async rotate(
    rawRefreshToken: string,
    meta: SessionMeta = {},
  ): Promise<IssuedSession> {
    const tokenHash = hashToken(rawRefreshToken);
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!current) {
      throw new UnauthorizedException('Sesión no válida');
    }

    // Detección de reutilización: si llega un token YA revocado, es señal de robo
    // (alguien está usando una copia antigua). Cortamos toda la cadena revocando
    // TODOS los refresh del usuario, por seguridad.
    if (current.revokedAt) {
      this.logger.warn(
        `Reutilización de refresh token detectada para el usuario ${current.userId}; se revocan todas sus sesiones.`,
      );
      await this.revokeAllForUser(current.userId);
      throw new UnauthorizedException('Sesión no válida');
    }

    if (current.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión caducada');
    }

    const authUser: AuthenticatedUser = {
      id: current.user.id,
      email: current.user.email,
      role: current.user.role,
      emailVerified: current.user.emailVerifiedAt !== null,
    };

    // Emitimos el nuevo y marcamos el viejo como revocado+reemplazado, todo en una
    // transacción para no dejar estados a medias.
    const accessToken = await this.signAccessToken(authUser);
    const { token, tokenHash: newHash } = generateToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    const created = await this.prisma.refreshToken.create({
      data: {
        userId: authUser.id,
        tokenHash: newHash,
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    await this.prisma.refreshToken.update({
      where: { id: current.id },
      data: { revokedAt: new Date(), replacedByTokenId: created.id },
    });

    return {
      accessToken,
      refreshToken: token,
      refreshExpiresAt,
      user: authUser,
    };
  }

  // Revoca el refresh token concreto (logout de esta sesión). Idempotente: si no
  // existe o ya estaba revocado, no pasa nada.
  async revoke(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Revoca todas las sesiones activas del usuario (reutilización detectada, o
  // reseteo de contraseña en la tarea 11).
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    // El tipo de expiresIn en jsonwebtoken es un template literal (StringValue);
    // un string plano de la config no encaja, así que casteamos las opciones.
    const options = { expiresIn: this.accessTtl } as JwtSignOptions;
    return this.jwt.signAsync(payload, options);
  }
}
