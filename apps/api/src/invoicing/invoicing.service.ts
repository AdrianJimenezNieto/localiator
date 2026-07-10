import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Invoice } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Tipo de IVA general por defecto, en puntos básicos (2100 = 21 %). Los precios
// del catálogo son IVA INCLUIDO (decisión de negocio), así que el desglose es
// "hacia atrás": del bruto (total del pedido) se saca la base y la cuota.
export const DEFAULT_VAT_RATE_BPS = 2100;

// Datos fiscales del emisor. Constantes (de configuración) porque no cambian por
// factura; los rellena Adrián en .env (ver tasks/manual.md). Placeholders hasta
// entonces.
interface Issuer {
  name: string;
  taxId: string;
  address: string;
}

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Desglosa un importe IVA INCLUIDO en base y cuota, con aritmética entera:
  //   net = round(gross * 10000 / (10000 + rateBps));  vat = gross − net.
  // Restar en vez de calcular la cuota por separado garantiza net + vat = gross
  // (sin descuadres de redondeo de un céntimo).
  static breakdownFromGross(
    grossCents: number,
    vatRateBps = DEFAULT_VAT_RATE_BPS,
  ): { netCents: number; vatCents: number } {
    const netCents = Math.round((grossCents * 10000) / (10000 + vatRateBps));
    return { netCents, vatCents: grossCents - netCents };
  }

  // Genera la factura de un pedido pagado. Idempotente: si ya existe (el webhook
  // de Stripe puede reintentar), devuelve la que hay. La numeración correlativa se
  // asigna dentro de una transacción con un contador atómico por año.
  async generateForOrder(orderId: string): Promise<Invoice | null> {
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (existing) return existing;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { email: true } } },
    });
    if (!order) {
      this.logger.error(`No se puede facturar: pedido ${orderId} no existe`);
      return null;
    }

    const grossCents = order.totalCents;
    const vatRateBps = DEFAULT_VAT_RATE_BPS;
    const { netCents, vatCents } = InvoicingService.breakdownFromGross(
      grossCents,
      vatRateBps,
    );
    const year = new Date().getFullYear();

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Contador atómico: inserta la fila del año o incrementa la existente,
        // devolviendo el nuevo número. El UPDATE bloquea la fila, así que dos
        // facturas simultáneas obtienen números distintos y sin huecos.
        const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
          INSERT INTO "InvoiceCounter" ("year", "lastNumber")
          VALUES (${year}, 1)
          ON CONFLICT ("year")
          DO UPDATE SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1
          RETURNING "lastNumber"`;
        const seq = rows[0].lastNumber;
        const number = `${year}-${String(seq).padStart(6, '0')}`;

        return tx.invoice.create({
          data: {
            orderId,
            number,
            netCents,
            vatRateBps,
            vatCents,
            grossCents,
            customerEmail: order.user.email,
          },
        });
      });
    } catch (err) {
      // Carrera: otra ejecución concurrente creó la factura entre el findUnique y
      // el create (orderId @unique lo impide duplicar). Devolvemos la existente.
      const already = await this.prisma.invoice.findUnique({
        where: { orderId },
      });
      if (already) return already;
      throw err;
    }
  }

  // Datos fiscales del emisor desde configuración (placeholders hasta que Adrián
  // los rellene en .env, ver tasks/manual.md).
  private issuer(): Issuer {
    return {
      name: this.config.get<string>('INVOICE_ISSUER_NAME') ?? 'Localiator',
      taxId: this.config.get<string>('INVOICE_ISSUER_TAX_ID') ?? 'B00000000',
      address:
        this.config.get<string>('INVOICE_ISSUER_ADDRESS') ??
        'Dirección pendiente de configurar',
    };
  }

  // Documento de factura como HTML descargable (MVP sin librería de PDF, coste
  // mínimo; se puede mejorar a PDF después). Incluye emisor, cliente y desglose.
  renderHtml(invoice: Invoice): string {
    const issuer = this.issuer();
    const eur = (cents: number) => (cents / 100).toFixed(2) + ' €';
    const vatPct = (invoice.vatRateBps / 100).toFixed(0);
    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Factura ${invoice.number}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; color: #171717; }
  h1 { font-size: 1.5rem; } table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  td, th { padding: .5rem 0; text-align: left; } .r { text-align: right; }
  .tot { border-top: 1px solid #ccc; font-weight: 700; }
  .muted { color: #666; font-size: .9rem; }
</style></head><body>
  <h1>Factura ${invoice.number}</h1>
  <p class="muted">Fecha de emisión: ${invoice.issuedAt.toISOString().slice(0, 10)}</p>
  <p><strong>${issuer.name}</strong> · NIF ${issuer.taxId}<br>${issuer.address}</p>
  <p class="muted">Cliente: ${invoice.customerEmail}</p>
  <table>
    <tr><td>Base imponible</td><td class="r">${eur(invoice.netCents)}</td></tr>
    <tr><td>IVA (${vatPct} %)</td><td class="r">${eur(invoice.vatCents)}</td></tr>
    <tr class="tot"><td>Total</td><td class="r">${eur(invoice.grossCents)}</td></tr>
  </table>
  <p class="muted">Importes con IVA incluido. Pedido ${invoice.orderId}.</p>
</body></html>`;
  }
}
