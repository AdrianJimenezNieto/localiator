import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';
import { AuctionsGateway } from './auctions.gateway';
import { AuctionsCloserService } from './auctions.closer.service';

// Módulo de subastas (Fase 5). Reglas de puja (tarea 02) + canal en vivo (tarea
// 03); en tareas siguientes suma la concurrencia (04), el antisniping (05), el
// cierre automático (06), el impago (07) y el cobro (09). Exporta AuctionsService
// para que los jobs lo reutilicen.
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
  ],
  controllers: [AuctionsController],
  providers: [AuctionsService, AuctionsGateway, AuctionsCloserService],
  exports: [AuctionsService],
})
export class AuctionsModule {}
