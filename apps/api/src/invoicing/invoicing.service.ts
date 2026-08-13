import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceRegime, InvoiceType, Prisma } from '@prisma/client';
import type { Invoice, InvoiceLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Tipo de IVA general por defecto, en puntos básicos (2100 = 21 %). SOLO se usa en
// régimen general; bajo REBU no hay cuota repercutida que desglosar.
export const DEFAULT_VAT_RATE_BPS = 2100;

// Umbral de la factura SIMPLIFICADA en venta al por menor (art. 4 RD 1619/2012):
// 3.000 € IVA incluido. Por encima hay que emitir factura completa, que exige
// identificar al destinatario con NIF y domicilio.
export const SIMPLIFIED_MAX_CENTS = 300_000;

// Serie de las facturas RECTIFICATIVAS. El art. 15 RD 1619/2012 exige que vayan en
// una serie específica y separada de las ordinarias.
const CORRECTIVE_SERIES = 'R';
const ORDINARY_SERIES = '';

// Mención obligatoria en factura cuando se aplica el régimen especial de bienes
// usados (art. 6.1.j RD 1619/2012). Sin ella la factura es incorrecta.
export const REBU_LEGEND =
  'Régimen especial de los bienes usados, objetos de arte, antigüedades y ' +
  'objetos de colección. IVA incluido en el precio, no deducible por el ' +
  'destinatario (art. 138 Ley 37/1992).';

interface Issuer {
  name: string;
  taxId: string;
  address: string;
}

// Factura con sus líneas, que es como se renderiza siempre.
export type InvoiceWithLines = Invoice & { lines: InvoiceLine[] };

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
  // (sin descuadres de redondeo de un céntimo). Solo aplica en RÉGIMEN GENERAL.
  static breakdownFromGross(
    grossCents: number,
    vatRateBps = DEFAULT_VAT_RATE_BPS,
  ): { netCents: number; vatCents: number } {
    const netCents = Math.round((grossCents * 10000) / (10000 + vatRateBps));
    return { netCents, vatCents: grossCents - netCents };
  }

  // Régimen con el que factura el negocio. Configurable, pero por defecto REBU:
  // se revenden bienes usados comprados en lotes de subasta (CLAUDE.md).
  private regime(): InvoiceRegime {
    return this.config.get<string>('INVOICE_REGIME') === 'GENERAL'
      ? InvoiceRegime.GENERAL
      : InvoiceRegime.REBU;
  }

  // Genera la factura de un pedido pagado. Idempotente: si ya existe la original
  // (el webhook de Stripe puede reintentar), devuelve la que hay.
  async generateForOrder(orderId: string): Promise<InvoiceWithLines | null> {
    const existing = await this.findOriginal(orderId);
    if (existing) return existing;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true, user: true },
    });
    if (!order) {
      this.logger.error(`No se puede facturar: pedido ${orderId} no existe`);
      return null;
    }

    const user = order.user;
    // Con NIF del cliente se emite factura COMPLETA; sin él, SIMPLIFICADA, que es
    // lo que corresponde a una venta al por menor a un particular.
    const hasFiscalData = Boolean(
      user.taxId && user.firstName && user.addressLine1,
    );
    const type = hasFiscalData ? InvoiceType.FULL : InvoiceType.SIMPLIFIED;

    // La simplificada tiene tope legal. Por encima hace falta la completa, y si no
    // tenemos los datos del cliente NO podemos emitirla bien: se emite igualmente
    // (el cobro ya ocurrió y el cliente necesita su documento) pero se registra a
    // nivel error para completarla a mano. Bloquear aquí dejaría un pedido pagado
    // sin ningún documento, que es peor.
    if (
      type === InvoiceType.SIMPLIFIED &&
      order.totalCents > SIMPLIFIED_MAX_CENTS
    ) {
      this.logger.error(
        `Pedido ${orderId} de ${order.totalCents} c supera el tope de la factura ` +
          'simplificada y el cliente no tiene NIF/domicilio. Documento emitido ' +
          'INCOMPLETO: completar los datos fiscales y reemitir.',
      );
    }

    const regime = this.regime();
    // Bajo REBU no hay desglose: la cuota no se repercute al cliente.
    const vat =
      regime === InvoiceRegime.GENERAL
        ? InvoicingService.breakdownFromGross(order.totalCents)
        : null;

    return this.createDocument({
      orderId,
      type,
      regime,
      series: ORDINARY_SERIES,
      grossCents: order.totalCents,
      vat,
      user,
      lines: order.lines.map((l) => ({
        description: l.nameSnapshot,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        lineTotalCents: l.lineTotalCents,
      })),
    });
  }

  // Emite una factura RECTIFICATIVA por un reembolso (art. 15 RD 1619/2012). Los
  // importes van en NEGATIVO: el documento representa la corrección, no un total
  // nuevo. Va en serie propia ("R2026-000001") y cita la factura que rectifica.
  //
  // `deltaCents` es lo devuelto EN ESTA operación, no el acumulado: así dos
  // reembolsos parciales generan dos rectificativas, cada una por su importe, que
  // es como debe documentarse.
  async generateCorrective(params: {
    orderId: string;
    deltaCents: number;
    reason: string;
  }): Promise<InvoiceWithLines | null> {
    const original = await this.findOriginal(params.orderId);
    if (!original) {
      this.logger.error(
        `No se puede rectificar el pedido ${params.orderId}: no tiene factura original`,
      );
      return null;
    }
    if (params.deltaCents <= 0) {
      return null; // nada que rectificar.
    }

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      include: { user: true },
    });
    if (!order) return null;

    const grossCents = -params.deltaCents;
    const vat =
      original.regime === InvoiceRegime.GENERAL
        ? (() => {
            const b = InvoicingService.breakdownFromGross(params.deltaCents);
            return { netCents: -b.netCents, vatCents: -b.vatCents };
          })()
        : null;

    return this.createDocument({
      orderId: params.orderId,
      type: InvoiceType.CORRECTIVE,
      regime: original.regime,
      series: CORRECTIVE_SERIES,
      grossCents,
      vat,
      user: order.user,
      correctsInvoiceId: original.id,
      correctionReason: params.reason,
      lines: [
        {
          description: `Rectificación de la factura ${original.number}`,
          quantity: 1,
          unitPriceCents: grossCents,
          lineTotalCents: grossCents,
        },
      ],
    });
  }

  // La factura ORIGINAL de un pedido (no las rectificativas).
  async findOriginal(orderId: string): Promise<InvoiceWithLines | null> {
    return this.prisma.invoice.findFirst({
      where: { orderId, type: { not: InvoiceType.CORRECTIVE } },
      include: { lines: true },
    });
  }

  // Todos los documentos de un pedido, en orden de emisión.
  async listForOrder(orderId: string): Promise<InvoiceWithLines[]> {
    return this.prisma.invoice.findMany({
      where: { orderId },
      include: { lines: true },
      orderBy: { issuedAt: 'asc' },
    });
  }

  // Crea el documento con su número correlativo, dentro de una transacción.
  private async createDocument(params: {
    orderId: string;
    type: InvoiceType;
    regime: InvoiceRegime;
    series: string;
    grossCents: number;
    vat: { netCents: number; vatCents: number } | null;
    user: {
      email: string;
      taxId: string | null;
      firstName: string | null;
      lastName: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      postalCode: string | null;
      city: string | null;
      province: string | null;
      country: string | null;
    };
    correctsInvoiceId?: string;
    correctionReason?: string;
    lines: {
      description: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }[];
  }): Promise<InvoiceWithLines> {
    const issuer = this.issuer();
    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      // Contador atómico POR AÑO Y SERIE: inserta la fila o incrementa la
      // existente, devolviendo el nuevo número. El UPDATE bloquea la fila, así que
      // dos facturas simultáneas obtienen números distintos y sin huecos. Serie y
      // año en la clave porque las rectificativas numeran aparte.
      const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
        INSERT INTO "InvoiceCounter" ("year", "series", "lastNumber")
        VALUES (${year}, ${params.series}, 1)
        ON CONFLICT ("year", "series")
        DO UPDATE SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1
        RETURNING "lastNumber"`;
      const seq = rows[0].lastNumber;
      const number = `${params.series}${year}-${String(seq).padStart(6, '0')}`;

      return tx.invoice.create({
        data: {
          orderId: params.orderId,
          type: params.type,
          regime: params.regime,
          number,
          series: params.series,
          grossCents: params.grossCents,
          netCents: params.vat?.netCents ?? null,
          vatRateBps: params.vat ? DEFAULT_VAT_RATE_BPS : null,
          vatCents: params.vat?.vatCents ?? null,
          issuerName: issuer.name,
          issuerTaxId: issuer.taxId,
          issuerAddress: issuer.address,
          customerEmail: params.user.email,
          // Solo la factura completa identifica al destinatario. En la simplificada
          // se dejan a null a propósito: no es un dato que falte, es que no procede.
          customerName:
            params.type === InvoiceType.SIMPLIFIED
              ? null
              : this.fullName(params.user),
          customerTaxId:
            params.type === InvoiceType.SIMPLIFIED ? null : params.user.taxId,
          customerAddress:
            params.type === InvoiceType.SIMPLIFIED
              ? null
              : this.composeAddress(params.user),
          correctsInvoiceId: params.correctsInvoiceId ?? null,
          correctionReason: params.correctionReason ?? null,
          lines: { create: params.lines },
        },
        include: { lines: true },
      });
    });
  }

  private fullName(user: {
    firstName: string | null;
    lastName: string | null;
  }): string | null {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return name || null;
  }

  private composeAddress(user: {
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
  }): string | null {
    const parts = [
      [user.addressLine1, user.addressLine2].filter(Boolean).join(', '),
      [user.postalCode, user.city].filter(Boolean).join(' '),
      user.province,
      user.country,
    ].filter((p) => p && p.length > 0);
    return parts.length ? parts.join(' · ') : null;
  }

  // Datos fiscales del emisor desde configuración. Se copian a cada factura al
  // emitirla (ver snapshot en el esquema), así que cambiar el .env no reescribe
  // las ya emitidas.
  private issuer(): Issuer {
    return {
      name: this.config.get<string>('INVOICE_ISSUER_NAME') ?? 'Localiator',
      taxId: this.config.get<string>('INVOICE_ISSUER_TAX_ID') ?? 'B00000000',
      address:
        this.config.get<string>('INVOICE_ISSUER_ADDRESS') ??
        'Dirección pendiente de configurar',
    };
  }

  // Documento como HTML descargable (MVP sin librería de PDF, coste mínimo).
  //
  // Todo lo que se imprime sale del SNAPSHOT de la propia factura, nunca de las
  // tablas vivas: un documento fiscal no puede cambiar de contenido porque el
  // cliente edite su perfil o porque se toque una variable de entorno.
  renderHtml(invoice: InvoiceWithLines): string {
    const eur = (cents: number) => (cents / 100).toFixed(2) + ' €';
    const isCorrective = invoice.type === InvoiceType.CORRECTIVE;
    const title = isCorrective
      ? 'Factura rectificativa'
      : invoice.type === InvoiceType.SIMPLIFIED
        ? 'Factura simplificada'
        : 'Factura';

    const lineRows = invoice.lines
      .map(
        (l) =>
          `<tr><td>${esc(l.description)}</td><td class="r">${l.quantity}</td>` +
          `<td class="r">${eur(l.unitPriceCents)}</td>` +
          `<td class="r">${eur(l.lineTotalCents)}</td></tr>`,
      )
      .join('');

    // Bajo REBU NO se imprime desglose de IVA: la cuota no se repercute y mostrarla
    // haría creer al cliente que puede deducírsela. En su lugar va la mención legal.
    const totalsRows =
      invoice.regime === InvoiceRegime.GENERAL && invoice.netCents !== null
        ? `<tr><td colspan="3">Base imponible</td><td class="r">${eur(invoice.netCents)}</td></tr>
           <tr><td colspan="3">IVA (${((invoice.vatRateBps ?? 0) / 100).toFixed(0)} %)</td><td class="r">${eur(invoice.vatCents ?? 0)}</td></tr>`
        : '';

    const customerBlock =
      invoice.type === InvoiceType.SIMPLIFIED
        ? `<p class="muted">Cliente: ${esc(invoice.customerEmail)}</p>`
        : `<p><strong>${esc(invoice.customerName ?? '—')}</strong>${
            invoice.customerTaxId ? ` · NIF ${esc(invoice.customerTaxId)}` : ''
          }<br>${esc(invoice.customerAddress ?? '—')}<br>
          <span class="muted">${esc(invoice.customerEmail)}</span></p>`;

    const correctiveBlock = isCorrective
      ? `<p class="warn">Rectifica a la factura indicada. Motivo: ${esc(invoice.correctionReason ?? '—')}.
         Los importes negativos representan la corrección, no un nuevo total.</p>`
      : '';

    const regimeBlock =
      invoice.regime === InvoiceRegime.REBU
        ? `<p class="muted">${REBU_LEGEND}</p>`
        : '<p class="muted">Importes con IVA incluido.</p>';

    return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${title} ${esc(invoice.number)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; color: #171717; }
  h1 { font-size: 1.5rem; } table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  td, th { padding: .5rem 0; text-align: left; } .r { text-align: right; }
  .tot { border-top: 1px solid #ccc; font-weight: 700; }
  .muted { color: #666; font-size: .9rem; }
  .warn { background: #fff7ed; padding: .75rem; border-left: 3px solid #ea580c; font-size: .9rem; }
</style></head><body>
  <h1>${title} ${esc(invoice.number)}</h1>
  <p class="muted">Fecha de expedición: ${invoice.issuedAt.toISOString().slice(0, 10)}</p>
  ${correctiveBlock}
  <p><strong>${esc(invoice.issuerName)}</strong> · NIF ${esc(invoice.issuerTaxId)}<br>${esc(invoice.issuerAddress)}</p>
  ${customerBlock}
  <table>
    <tr><th>Descripción</th><th class="r">Uds.</th><th class="r">Precio</th><th class="r">Importe</th></tr>
    ${lineRows}
    ${totalsRows}
    <tr class="tot"><td colspan="3">Total</td><td class="r">${eur(invoice.grossCents)}</td></tr>
  </table>
  ${regimeBlock}
  <p class="muted">Pedido ${esc(invoice.orderId)}.</p>
</body></html>`;
  }
}

// Escapado de HTML. Los nombres de artículo y los datos del cliente son entrada de
// usuario que acaba en un documento que se sirve como text/html: sin esto, un
// artículo llamado `<script>…` se ejecutaría al abrir la factura.
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Reexportado para los tests y para quien componga consultas sobre facturas.
export { InvoiceType, InvoiceRegime, Prisma };
