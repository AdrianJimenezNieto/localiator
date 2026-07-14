import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { OrderMailService } from './order-mail.service';
import { AuctionMailService } from './auction-mail.service';

// Exporta MailService (transporte Resend), OrderMailService (emails de pedido) y
// AuctionMailService (emails de subasta, tarea 08) para que AuthModule, el webhook
// de pagos, OrdersModule y AuctionsModule los inyecten sin reconstruir la config.
@Module({
  providers: [MailService, OrderMailService, AuctionMailService],
  exports: [MailService, OrderMailService, AuctionMailService],
})
export class MailModule {}
