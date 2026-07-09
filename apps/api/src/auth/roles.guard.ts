import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { ROLES_KEY } from './auth.constants';
import { RequestUser } from './jwt.strategy';

// Autorización por rol. Corre DESPUÉS del JwtAuthGuard (que ya puso req.user).
// Distinción clave: autenticar = quién eres (401, lo hace JwtAuthGuard);
// autorizar = qué puedes hacer (403, lo hace este guard).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles(): la ruta solo exige estar autenticado (ya garantizado por el
    // JwtAuthGuard). No imponemos rol.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | undefined;
    // Si el rol del usuario no está entre los permitidos → false → 403 Forbidden.
    return !!user && required.includes(user.role as Role);
  }
}
