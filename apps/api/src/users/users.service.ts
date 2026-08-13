import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Campos obligatorios para poder facturar (identidad + dirección). `phone` y
// `addressLine2` quedan fuera a propósito: son opcionales también en el registro.
const REQUIRED_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'birthDate',
  'addressLine1',
  'postalCode',
  'city',
  'province',
  'country',
] as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Usado por GET /auth/me para que el frontend sepa si tiene que pedir los
  // datos personales antes del checkout (p. ej. una cuenta creada por Google).
  async isProfileComplete(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;
    return REQUIRED_PROFILE_FIELDS.every((field) => user[field] != null);
  }

  // Completar/editar los datos personales de la propia cuenta (decisión: se
  // piden en el checkout, no justo tras el login social). Mismas reglas de
  // validación que el registro, vía UpdateProfileDto.
  async updateOwnProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    // Mismo criterio que anonymizeOwnAccount: una cuenta que ejerció el derecho
    // al olvido no debe poder rellenar datos personales de nuevo.
    if (user.anonymizedAt) {
      throw new BadRequestException('Esta cuenta ha sido eliminada');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { ...dto, birthDate: new Date(dto.birthDate) },
      select: { id: true },
    });
  }

  // Derecho al olvido (RGPD): anonimiza la cuenta del propio usuario en lugar de
  // borrarla, porque un usuario con FACTURAS no puede desaparecer (deber de
  // conservación fiscal). Sustituimos los datos personales por valores neutros y
  // conservamos las facturas ya emitidas.
  //
  // Todo lo que debe cuadrar va en una transacción: anonimizar el usuario, borrar
  // sus cuentas OAuth (para que no pueda volver a entrar con Google), borrar sus
  // tokens de verificación pendientes y revocar sus refresh tokens. O se aplica
  // todo o nada.
  async anonymizeOwnAccount(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Idempotente: si ya está anonimizada, no rehacemos el trabajo.
    if (user.anonymizedAt) {
      return { message: 'La cuenta ya estaba eliminada.' };
    }

    // Email neutro y único: usamos el id (ya no es dato personal) sobre un dominio
    // .invalid reservado por la RFC 2606, que nunca resolverá ni recibirá correo.
    const anonymizedEmail = `borrado+${userId}@localiator.invalid`;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          passwordHash: null,
          emailVerifiedAt: null,
          // RGPD: borramos también los datos personales recogidos en el registro
          // (identidad, contacto y dirección). Las facturas ya emitidas conservan
          // los datos que la ley obliga a guardar; el perfil del usuario no.
          firstName: null,
          lastName: null,
          birthDate: null,
          phone: null,
          taxId: null,
          addressLine1: null,
          addressLine2: null,
          postalCode: null,
          city: null,
          province: null,
          country: null,
          anonymizedAt: new Date(),
        },
      }),
      this.prisma.oAuthAccount.deleteMany({ where: { userId } }),
      this.prisma.verificationToken.deleteMany({ where: { userId } }),
      // Revocar (no borrar) los refresh tokens activos: cierra todas las sesiones.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Traza de la acción sensible (CLAUDE.md). El AuditLog actual solo modela
    // precio/stock; la traza estructurada rica llega en la tarea 08.
    this.logger.log(
      `Cuenta anonimizada (derecho al olvido): usuario ${userId}`,
    );

    return { message: 'Tu cuenta ha sido eliminada.' };
  }
}
