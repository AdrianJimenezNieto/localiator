import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

// Exporta MailService para que AuthModule (y futuros módulos: pedidos, subastas)
// puedan inyectarlo sin reconstruir la configuración de Resend.
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
