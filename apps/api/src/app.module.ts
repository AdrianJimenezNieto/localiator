import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    // Habilita las tareas @Cron (limpieza de sesiones caducadas, tarea 10).
    ScheduleModule.forRoot(),
    // Rate limiting global: 100 peticiones por minuto y por IP. Los endpoints
    // sensibles de auth aprietan más con @Throttle. Store en memoria (una sola
    // instancia en el VPS); si se escalara a varias haría falta Redis.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guards GLOBALES. Orden = orden de ejecución:
    //  1. ThrottlerGuard: frena por frecuencia ANTES de tocar auth/BD.
    //  2. JwtAuthGuard: autentica (o deja pasar las @Public).
    //  3. RolesGuard: autoriza por rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
