import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

// Cualquier fallo del flujo OAuth (consentimiento cancelado, credenciales de
// Google inválidas, state que no cuadra) llega aquí como esta excepción, nunca
// como un 401 sin más. Guardamos la causa solo para el log; al cliente no le
// interesa el detalle, solo que vuelva a intentarlo.
export class OAuthFailedException extends Error {
  constructor(
    readonly cause?: unknown,
    readonly info?: unknown,
  ) {
    super('OAuth login failed');
  }
}

// Traduce el fallo a un redirect al frontend en vez de devolver JSON en el
// dominio de la API: un 401 crudo en /auth/google/callback confundiría al
// usuario (está viendo la respuesta de la API, no la web).
@Catch(OAuthFailedException)
export class OAuthErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(OAuthErrorFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: OAuthFailedException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    req.log?.warn(
      { err: exception.cause, info: exception.info },
      'Login con Google fallido',
    );

    const appUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:5173';
    res.redirect(`${appUrl}/login?error=oauth`);
  }
}
