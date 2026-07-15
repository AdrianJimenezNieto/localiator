import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { AuctionsGateway } from './auctions.gateway';
import { AuctionsLifecycleService } from './auctions.lifecycle.service';
import { MailModule } from '../mail/mail.module';
import { OrdersModule } from '../orders/orders.module';

// Módulo de subastas (Fase 5). Reglas de puja (tarea 02) + canal en vivo (tarea
// 03); en tareas siguientes suma la concurrencia (04), el antisniping (05), el
// cierre automático (06), el impago (07), el cobro (09) y la apertura automática
// (10). Exporta AuctionsService para que los jobs lo reutilicen.
//
// JwtModule: el gateway verifica a mano el token del handshake del WebSocket
// (los guards HTTP no ven el handshake). Mismo secreto que el auth HTTP.
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_ACCESS_SECRET') || 'dev-insecure-secret',
      }),
    }),
    // Emails de subasta (tarea 08): respaldo del WebSocket para superado/ganado.
    MailModule,
    // Cobro del ganador (tarea 09): reutiliza OrdersService para crear el pedido
    // del ganador y que pague por el flujo Stripe existente.
    OrdersModule,
  ],
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionsGateway, AuctionsLifecycleService],
  exports: [AuctionsService],
})
export class AuctionsModule {}
