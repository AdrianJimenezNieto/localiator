import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuctionsService } from './auctions.service';

// Cierre automático de subastas vencidas (tarea 06). Cada minuto busca las
// subastas LIVE cuyo `endsAt` ya pasó y las cierra, fijando ganador o dejándolas
// desiertas.
//
// Se elige un cron periódico frente a un timer por subasta porque **sobrevive a
// reinicios del proceso**: un timer en memoria se perdería al reiniciar y la
// subasta no se cerraría nunca. El cron, en cambio, vuelve a encontrar las
// vencidas en la siguiente pasada. Para el volumen del MVP, cada minuto es
// proporcionado (mismo criterio que el barrido de reservas de la Fase 3).
// Requiere ScheduleModule.forRoot() en AppModule (ya habilitado).
@Injectable()
export class AuctionsCloserService {
  private readonly logger = new Logger(AuctionsCloserService.name);

  constructor(private readonly auctions: AuctionsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleClose(): Promise<void> {
    const dueIds = await this.auctions.findDueAuctions();
    let closed = 0;
    for (const id of dueIds) {
      // closeAuction es idempotente y transaccional: si otra pasada del cron ya
      // la cerró, o el antisniping la extendió, no hace nada.
      const result = await this.auctions.closeAuction(id);
      if (
        result.outcome === 'closed_won' ||
        result.outcome === 'closed_empty'
      ) {
        closed++;
      }
    }
    if (closed > 0) {
      this.logger.log(`Subastas cerradas automáticamente: ${closed}.`);
    }
  }
}
