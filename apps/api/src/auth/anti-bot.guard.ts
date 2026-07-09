import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { TurnstileService } from './turnstile.service';

// Nombre del campo trampa (honeypot). Es un input oculto por CSS en el frontend
// (no type=hidden, y fuera del tab order): un humano nunca lo rellena, muchos
// bots sí. Que atraiga por el nombre ("website").
export const HONEYPOT_FIELD = 'website';

// Guard anti-bot para los formularios sensibles (registro, login, recuperación).
// Dos capas complementarias, baratas antes de tocar la BD:
//  1. Honeypot: si el campo trampa llega con valor → es un bot → 400.
//  2. Turnstile: verifica el token del CAPTCHA invisible en el servidor.
//
// Los guards corren ANTES del ValidationPipe, así que aquí el body aún conserva
// los campos `website` y `turnstileToken` aunque el DTO (whitelist) los descarte
// luego. Reutilizable con @UseGuards para no olvidar la verificación en algún
// formulario.
@Injectable()
export class AntiBotGuard implements CanActivate {
  constructor(private readonly turnstile: TurnstileService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = (request.body ?? {}) as Record<string, unknown>;

    // 1. Honeypot: relleno = bot. Rechazamos con un mensaje genérico (no le
    // decimos al bot que le hemos pillado por el honeypot).
    const honeypot = body[HONEYPOT_FIELD];
    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
      throw new BadRequestException('Solicitud no válida');
    }

    // 2. Turnstile.
    const token =
      typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined;
    const ok = await this.turnstile.verify(token, request.ip);
    if (!ok) {
      throw new BadRequestException('Verificación anti-bot fallida');
    }

    return true;
  }
}
