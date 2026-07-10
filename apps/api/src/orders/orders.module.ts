import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ReservationCleanupService } from './reservation-cleanup.service';

// Módulo de pedidos: creación con reserva de stock (tarea 03) y, en tareas
// siguientes, el pago (04), el webhook (06) y las transiciones de estado (11).
// Exporta OrdersService para que Payments/webhook lo reutilicen.
@Module({
  imports: [MailModule],
  controllers: [OrdersController],
  providers: [OrdersService, ReservationCleanupService],
  exports: [OrdersService],
})
export class OrdersModule {}
