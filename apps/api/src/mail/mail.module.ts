import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { OrderMailService } from './order-mail.service';

// Exporta MailService (transporte Resend) y OrderMailService (emails de pedido)
// para que AuthModule, el webhook de pagos y OrdersModule los inyecten sin
// reconstruir la configuración.
@Module({
  providers: [MailService, OrderMailService],
  exports: [MailService, OrderMailService],
})
export class MailModule {}
