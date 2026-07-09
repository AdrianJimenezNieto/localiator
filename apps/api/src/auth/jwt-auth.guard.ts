import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './auth.constants';

// Guard de autenticación GLOBAL (se registra en app.module con APP_GUARD): exige
// un access token válido en todas las rutas SALVO las marcadas con @Public().
// Este es el "denegar por defecto": olvidar proteger una ruta no la deja abierta.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // getAllAndOverride mira primero el handler y luego la clase: permite marcar
    // pública una ruta concreta o un controlador entero.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
