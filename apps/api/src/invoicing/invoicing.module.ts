import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';

// Facturación (tarea 09): generación automática tras el pago y descarga de la
// factura. Exporta InvoicingService para que el webhook (PaymentsModule) dispare
// la generación al confirmar el cobro.
@Module({
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
