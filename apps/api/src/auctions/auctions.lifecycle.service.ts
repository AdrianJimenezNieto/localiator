import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuctionsService } from './auctions.service';

// Ciclo de vida automático de las subastas: las abre al llegar su `startsAt`
// (tarea 10) y las cierra al pasar su `endsAt` (tarea 06), además de los avisos de
// cierre próximo (tarea 08) y el barrido de impagos (tarea 07). Abrir y cerrar son
// la misma preocupación —mover el estado según el reloj— y comparten cron, gateway
// y criterio de idempotencia, así que viven en el mismo servicio.
//
// Se elige un cron periódico frente a un timer por subasta porque **sobrevive a
// reinicios del proceso**: un timer en memoria se perdería al reiniciar y la
// subasta no se abriría/cerraría nunca. El cron, en cambio, vuelve a encontrar las
// pendientes en la siguiente pasada. Para el volumen del MVP, cada minuto es
// proporcionado (mismo criterio que el barrido de reservas de la Fase 3).
// Requiere ScheduleModule.forRoot() en AppModule (ya habilitado).
@Injectable()
export class AuctionsLifecycleService {
  private readonly logger = new Logger(AuctionsLifecycleService.name);

  constructor(private readonly auctions: AuctionsService) {}

  // Apertura automática (tarea 10). Cada minuto busca subastas SCHEDULED cuyo
  // `startsAt` ya llegó y las pone LIVE. openAuction reclama la subasta con un
  // updateMany condicional, así que pasadas solapadas no abren dos veces.
  @Cron(CronExpression.EVERY_MINUTE)
  async handleOpen(): Promise<void> {
    const startingIds = await this.auctions.findStartingAuctions();
    let opened = 0;
    let expired = 0;
    for (const id of startingIds) {
      const result = await this.auctions.openAuction(id);
      if (result.outcome === 'opened') {
        opened++;
      } else if (result.outcome === 'closed_expired') {
        expired++;
      }
    }
    if (opened > 0) {
      this.logger.log(`Subastas abiertas automáticamente: ${opened}.`);
    }
    // Una subasta que nace y muere sin abrirse es señal de que la API estuvo caída
    // todo su intervalo: conviene que se vea en los logs, no solo en la BD.
    if (expired > 0) {
      this.logger.warn(
        `Subastas cerradas sin llegar a abrirse (su intervalo pasó entero): ${expired}.`,
      );
    }
  }

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
