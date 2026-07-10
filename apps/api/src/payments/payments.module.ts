import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { InvoicingModule } from '../invoicing/invoicing.module';
import { MailModule } from '../mail/mail.module';
import { PaymentsController } from './payments.controller';
import { WebhookController } from './webhook.controller';
import { ReconciliationController } from './reconciliation.controller';
import { PaymentsService } from './payments.service';
import { ReconciliationService } from './reconciliation.service';
import { stripeProvider } from './stripe.provider';

// Módulo de pagos: creación de la Checkout Session (tarea 04) y, en la tarea 06,
// el webhook que confirma el cobro. Importa OrdersModule para reutilizar
// OrdersService (validación y enlace pedido ↔ PaymentIntent).
@Module({
  imports: [OrdersModule, InvoicingModule, MailModule],
  controllers: [
    PaymentsController,
    WebhookController,
    ReconciliationController,
  ],
  providers: [PaymentsService, ReconciliationService, stripeProvider],
})
export class PaymentsModule {}
