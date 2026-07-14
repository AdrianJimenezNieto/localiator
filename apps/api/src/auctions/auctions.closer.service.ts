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

  // Impago del ganador (tarea 07). Cada minuto busca subastas cerradas cuyo ganador
  // dejó vencer el plazo de pago y las procesa: banea al moroso y ofrece la subasta
  // al siguiente pujador (o la deja desierta). Mismo criterio que el cierre: un cron
  // periódico sobrevive a reinicios, y handleUnpaidWinner es idempotente, así que
  // solapes o reintentos no rebanean ni reasignan dos veces.
  @Cron(CronExpression.EVERY_MINUTE)
  async handleUnpaidWinners(): Promise<void> {
    const unpaidIds = await this.auctions.findUnpaidWinners();
    let reassigned = 0;
    let cancelled = 0;
    for (const id of unpaidIds) {
      const result = await this.auctions.handleUnpaidWinner(id);
      if (result.outcome === 'reassigned') {
        reassigned++;
      } else if (result.outcome === 'cancelled_empty') {
        cancelled++;
      }
    }
    if (reassigned > 0 || cancelled > 0) {
      this.logger.log(
        `Impagos procesados: ${reassigned} reasignadas, ${cancelled} desiertas.`,
      );
    }
  }

  // Aviso "a punto de cerrar" (tarea 08). Cada minuto busca subastas LIVE que entran
  // en la ventana de aviso y aún no se han avisado, y las notifica. notifyEndingSoon
  // reclama el aviso de forma atómica, así que solapes del cron no duplican el aviso.
  @Cron(CronExpression.EVERY_MINUTE)
  async handleEndingSoon(): Promise<void> {
    const ids = await this.auctions.findEndingSoon();
    let notified = 0;
    for (const id of ids) {
      if (await this.auctions.notifyEndingSoon(id)) {
        notified++;
      }
    }
    if (notified > 0) {
      this.logger.log(`Avisos "a punto de cerrar" enviados: ${notified}.`);
    }
  }
}
