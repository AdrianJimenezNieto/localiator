import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OAuthFailedException } from './oauth-error.filter';

// Envuelve AuthGuard('google') para que cualquier fallo del flujo (consentimiento
// cancelado, credenciales inválidas, state que no cuadra) se convierta en una
// excepción propia en vez de dejar que el 401 crudo de Passport llegue al
// cliente como JSON en el dominio de la API. El OAuthErrorFilter la traduce a
// un redirect al frontend.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  // Siempre pregunta con qué cuenta de Google entrar, para que cambiar de
  // cuenta no dependa de que el navegador ya tenga una sesión de Google abierta.
  getAuthenticateOptions() {
    return { prompt: 'select_account' };
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (err || !user) {
      throw new OAuthFailedException(err, info);
    }
    return user;
  }
}
