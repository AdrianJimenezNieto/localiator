import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // trust proxy = 1: en producción la API va detrás de Nginx Proxy Manager. Sin
  // esto, Express vería la IP del proxy en todas las peticiones y el rate limiting
  // (por IP) sería inútil o bloquearía a todos. Con '1' confía en el primer proxy
  // y usa la IP real de X-Forwarded-For.
  app.set('trust proxy', 1);

  // Lee las cookies (req.cookies): necesario para el refresh token de sesión.
  app.use(cookieParser());

  // Validación y saneamiento de toda entrada (whitelist descarta props no declaradas).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS con credenciales: el frontend (otro origen) debe poder enviar la cookie
  // del refresh token. origin explícito (no '*') es obligatorio con credentials.
  const origin =
    process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173';
  app.enableCors({ origin, credentials: true });

  await app.listen(process.env.API_PORT ?? 3000);
}
void bootstrap();
