import { Module } from '@nestjs/common';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';

// Módulo de subastas (Fase 5). Empieza con las reglas de puja (tarea 02); en
// tareas siguientes suma el canal en vivo (03), la concurrencia (04), el
// antisniping (05), el cierre automático (06), el impago (07) y el cobro (09).
// Exporta AuctionsService para que el gateway y los jobs lo reutilicen.
@Module({
  controllers: [AuctionsController],
  providers: [AuctionsService],
  exports: [AuctionsService],
})
export class AuctionsModule {}
