import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Verifica el token de Cloudflare Turnstile (CAPTCHA invisible) en el SERVIDOR.
// La validación real SIEMPRE es aquí: el token del frontend no es de fiar por sí
// solo. Aislado en un servicio para poder mockearlo en tests.
//
// Sin TURNSTILE_SECRET_KEY (dev/CI), verify() devuelve true (no bloquea): así el
// flujo funciona sin credenciales. Adrián conecta la secret key cuando quiera
// activar la protección de verdad.
const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface SiteverifyResponse {
  success: boolean;
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secret: string | undefined;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('TURNSTILE_SECRET_KEY') || undefined;
  }

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.secret) {
      // Modo desarrollo sin clave: no bloqueamos.
      return true;
    }
    if (!token) {
      return false;
    }

    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp) {
      body.set('remoteip', remoteIp);
    }

    try {
      const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
      const data = (await res.json()) as SiteverifyResponse;
      return data.success === true;
    } catch (error) {
      // Ante un fallo de red con Cloudflare, denegamos (fail-closed): más seguro
      // que dejar pasar sin verificar.
      this.logger.error(`Fallo al verificar Turnstile: ${String(error)}`);
      return false;
    }
  }
}
