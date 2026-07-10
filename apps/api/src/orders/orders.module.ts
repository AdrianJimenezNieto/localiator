import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// Módulo de pedidos: creación con reserva de stock (tarea 03) y, en tareas
// siguientes, el pago (04), el webhook (06) y las transiciones de estado (11).
// Exporta OrdersService para que Payments/webhook lo reutilicen.
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
