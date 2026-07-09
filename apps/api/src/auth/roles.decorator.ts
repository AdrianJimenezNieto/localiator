import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './auth.constants';

// Restringe una ruta a ciertos roles. Uso: @Roles(Role.ADMIN).
//
// Se usan los valores del enum `Role` de Prisma (BUYER/ADMIN) porque son los que
// realmente viajan en el access token (req.user.role). El `UserRole` de
// packages/shared es la representación para el frontend (incluye "guest", que
// aquí no aplica: "invitado" = ausencia de usuario, se cubre con @Public).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
