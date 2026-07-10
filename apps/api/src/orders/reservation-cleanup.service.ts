import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

// Barrido periódico de reservas de stock expiradas (tarea 07). Sin esto, un pago
// abandonado dejaría el stock bloqueado para siempre. Cada minuto libera las
// reservas caducadas de pedidos aún PENDING y cancela esos pedidos.
//
// Se elige el cron interno (@nestjs/schedule) frente a una cola/worker externo
// (BullMQ/Redis): es gratis y suficiente para el volumen del MVP; una cola añade
// infra y coste sin necesidad ahora (coherente con el principio de coste mínimo).
// Requiere ScheduleModule.forRoot() en AppModule (ya habilitado).
@Injectable()
export class ReservationCleanupService {
  private readonly logger = new Logger(ReservationCleanupService.name);

  constructor(private readonly orders: OrdersService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCleanup(): Promise<void> {
    const cancelled = await this.orders.releaseExpiredReservations();
    if (cancelled > 0) {
      this.logger.log(
        `Reservas expiradas liberadas: ${cancelled} pedido(s) PENDING cancelado(s).`,
      );
    }
  }
}
