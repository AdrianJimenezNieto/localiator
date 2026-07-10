import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { stripeProvider } from './stripe.provider';

// Módulo de pagos: creación de la Checkout Session (tarea 04) y, en la tarea 06,
// el webhook que confirma el cobro. Importa OrdersModule para reutilizar
// OrdersService (validación y enlace pedido ↔ PaymentIntent).
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, stripeProvider],
})
export class PaymentsModule {}
