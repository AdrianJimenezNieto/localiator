import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
