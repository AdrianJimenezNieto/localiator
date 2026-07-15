import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AuctionsModule } from '../auctions/auctions.module';
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
  // AuctionsModule: el webhook avisa a los pujadores si el cobro canceló una
  // subasta por agotarse el artículo (tarea 15). No hay ciclo: AuctionsModule
  // importa OrdersModule, y a PaymentsModule no lo importa nadie.
  imports: [OrdersModule, InvoicingModule, MailModule, AuctionsModule],
  controllers: [
    PaymentsController,
    WebhookController,
    ReconciliationController,
  ],
  providers: [PaymentsService, ReconciliationService, stripeProvider],
})
export class PaymentsModule {}
