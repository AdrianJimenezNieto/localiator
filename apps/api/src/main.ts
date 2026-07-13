import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { StorageService } from './catalog/storage.service';

async function bootstrap() {
  // rawBody: true conserva el cuerpo SIN parsear (req.rawBody, un Buffer) además
  // del JSON ya parseado. Lo necesita el webhook de Stripe (payments/webhook) para
  // verificar la firma sobre los bytes originales; el resto de rutas siguen usando
  // el body JSON normal.
  // bufferLogs: retiene los logs de arranque hasta que useLogger active pino, para
  // que también salgan estructurados (no con el logger por defecto de Nest).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Sustituye el logger de Nest por pino (nestjs-pino): logs estructurados con
  // request-id en toda la app, incluidos los this.logger.* de los servicios.
  app.useLogger(app.get(Logger));

  // trust proxy = 1: en producción la API va detrás de Nginx Proxy Manager. Sin
  // esto, Express vería la IP del proxy en todas las peticiones y el rate limiting
  // (por IP) sería inútil o bloquearía a todos. Con '1' confía en el primer proxy
  // y usa la IP real de X-Forwarded-For.
  app.set('trust proxy', 1);

  // Cabeceras de seguridad (tarea 05): HSTS, X-Content-Type-Options, marco
  // anti-clickjacking, etc. crossOriginResourcePolicy en 'cross-origin' porque las
  // fotos del catálogo se sirven desde el origen de la API y las carga la web
  // (otro origen); con el valor por defecto ('same-origin') no se verían.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Lee las cookies (req.cookies): necesario para el refresh token de sesión.
  app.use(cookieParser());

  // Validación y saneamiento de toda entrada. whitelist descarta props no
  // declaradas; forbidNonWhitelisted además RECHAZA (400) las peticiones que traen
  // campos de más, en vez de descartarlos en silencio (tarea 05). Los formularios
  // de auth declaran sus campos antibot en AntiBotDto para no ser rechazados.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS con credenciales: el frontend (otro origen) debe poder enviar la cookie
  // del refresh token. origin explícito (no '*') es obligatorio con credentials.
  const origin =
    process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173';
  app.enableCors({ origin, credentials: true });

  // Sirve las fotos subidas como archivos estáticos bajo /uploads. Al ser
  // middleware de Express (no pasa por los guards de Nest), las imágenes son
  // públicas: cualquiera puede verlas, que es justo lo que necesita el catálogo.
  const uploadDir = resolve(process.env.UPLOAD_DIR ?? 'uploads');
  app.useStaticAssets(uploadDir, { prefix: StorageService.PUBLIC_PATH });

  await app.listen(process.env.API_PORT ?? 3000);
}
void bootstrap();
