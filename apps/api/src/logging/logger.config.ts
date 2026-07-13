import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

// Construye la configuración de nestjs-pino (pino-http por debajo) a partir del
// entorno. Objetivos (tarea 08):
//  - Logs ESTRUCTURADOS (JSON) en producción → fáciles de filtrar/buscar.
//  - REQUEST-ID por petición para correlacionar todos los logs de una request.
//  - Nivel configurable por .env (LOG_LEVEL).
//  - NO filtrar datos sensibles (se redactan cabeceras con tokens/cookies).
export function buildLoggerParams(config: ConfigService): Params {
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const level = config.get<string>('LOG_LEVEL') ?? (isProd ? 'info' : 'debug');

  return {
    pinoHttp: {
      level,
      // En desarrollo, salida legible y coloreada; en producción, JSON crudo (lo
      // recoge Docker con rotación, tarea 09).
      transport: isProd
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true } },
      // Request-id: reutiliza el x-request-id entrante (si viene del proxy) o genera
      // uno; lo devuelve en la respuesta para poder correlacionar desde el cliente.
      genReqId: (req: IncomingMessage, res: ServerResponse): string => {
        const incoming = req.headers['x-request-id'];
        const id =
          (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Redacción: nunca volcamos credenciales a los logs. El cuerpo no se loguea
      // por defecto, así que las contraseñas/tokens del body tampoco aparecen.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
      // Rutas de salud/ruido a nivel silencioso: no ensucian el log en cada sondeo.
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
