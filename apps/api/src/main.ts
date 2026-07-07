import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validación y saneamiento de toda entrada (whitelist descarta props no declaradas).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const origin = process.env.VITE_APP_URL ?? 'http://localhost:5173';
  app.enableCors({ origin, credentials: true });

  await app.listen(process.env.API_PORT ?? 3000);
}
void bootstrap();
