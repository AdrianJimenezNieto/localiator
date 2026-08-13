import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

// Instrucciones de recogida en almacén (no hay envíos, CLAUDE.md). Texto
// configurable por env para no hardcodearlo en varios sitios (tarea 11 lo
// reutiliza en la web).
function pickupInstructions(config: ConfigService): string {
  return (
    config.get<string>('PICKUP_INSTRUCTIONS') ??
    'Puedes recoger tu pedido en nuestro almacén. Te indicaremos la dirección y el horario cuando esté listo.'
  );
}

// Emails transaccionales de PEDIDO (tarea 10). Aísla las plantillas y la carga de
// datos del pedido, y delega el transporte en MailService (que ya abstrae Resend y,
// sin clave, registra en el log en vez de enviar). Los disparos van desde el
// dominio (webhook al pagar; transiciones de estado en la tarea 11).
//
// TOLERANTE A FALLOS: un fallo de email NO debe revertir el pedido (el pago ya
// ocurrió). Por eso cada método captura y registra el error en vez de propagarlo.
@Injectable()
export class OrderMailService {
  private readonly logger = new Logger(OrderMailService.name);

  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Confirmación tras el pago (PAID): resumen de líneas, total, factura e
  // instrucciones de recogida.
  async sendOrderConfirmation(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lines: true,
        user: { select: { email: true } },
        invoices: { select: { number: true, type: true } },
      },
    });
    if (!order) return;

    const rows = order.lines
      .map(
        (l) =>
          `<tr><td>${l.nameSnapshot} × ${l.quantity}</td><td align="right">${this.eur(l.lineTotalCents)}</td></tr>`,
      )
      .join('');
    // La ORIGINAL, no una rectificativa (un pedido puede acumular varias).
    const original = order.invoices.find((i) => i.type !== 'CORRECTIVE');
    const invoiceLine = original
      ? `<p>Factura ${original.number}. Puedes descargarla desde "Mis pedidos".</p>`
      : '';

    await this.safeSend(
      order.user.email,
      `Pedido confirmado — ${this.eur(order.totalCents)}`,
      `<p>¡Gracias por tu compra! Hemos recibido tu pago.</p>
       <table>${rows}<tr><td><strong>Total</strong></td><td align="right"><strong>${this.eur(order.totalCents)}</strong></td></tr></table>
       ${invoiceLine}
       <p>${pickupInstructions(this.config)}</p>`,
    );
  }

  // Email por cambio de estado relevante (tarea 11): listo para recoger, recogido
  // o cancelado. La confirmación de pago tiene su propio método (arriba).
  async sendStatusChange(orderId: string, status: OrderStatus): Promise<void> {
    const template = this.statusTemplate(status);
    if (!template) return; // estado sin email (p. ej. PENDING/PAID).

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { user: { select: { email: true } } },
    });
    if (!order) return;

    await this.safeSend(order.user.email, template.subject, template.html);
  }

  // Aviso al cliente de que se le ha devuelto dinero. No sale de `statusTemplate`
  // porque un reembolso PARCIAL no cambia el estado del pedido y aun así hay que
  // avisar: el cliente ve el abono en su banco y merece saber a qué corresponde.
  async sendRefundNotice(
    orderId: string,
    refundedCents: number,
    isFull: boolean,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { user: { select: { email: true } } },
    });
    if (!order) return;

    const detalle = isFull
      ? '<p>Hemos reembolsado el importe completo de tu pedido.</p>'
      : '<p>Hemos reembolsado parcialmente tu pedido; el resto sigue en pie.</p>';

    await this.safeSend(
      order.user.email,
      `Reembolso de ${this.eur(refundedCents)}`,
      `${detalle}
       <p>Importe devuelto: <strong>${this.eur(refundedCents)}</strong>.</p>
       <p>El abono puede tardar unos días hábiles en aparecer en tu banco, según tu entidad.</p>`,
    );
  }

  // Alerta INTERNA por un chargeback. Va al admin, no al cliente: una disputa
  // tiene plazo de respuesta con pruebas (Stripe suele dar días contados) y
  // enterarse tarde equivale a perderla y perder el dinero y la mercancía. Sin
  // ADMIN_ALERT_EMAIL configurado no se envía nada: queda el log de nivel error,
  // igual que el resto de emails funcionan sin clave de Resend.
  async sendDisputeAlert(params: {
    orderId: string;
    totalCents: number;
    customerEmail?: string;
  }): Promise<void> {
    const to = this.config.get<string>('ADMIN_ALERT_EMAIL');
    if (!to) {
      this.logger.warn(
        `Disputa en el pedido ${params.orderId} sin avisar por email: ` +
          'falta ADMIN_ALERT_EMAIL en la configuración',
      );
      return;
    }

    await this.safeSend(
      to,
      `[Localiator] Disputa abierta en el pedido ${params.orderId}`,
      `<p>Un cliente ha abierto una disputa (chargeback).</p>
       <ul>
         <li>Pedido: <strong>${params.orderId}</strong></li>
         <li>Importe: <strong>${this.eur(params.totalCents)}</strong></li>
         <li>Cliente: ${params.customerEmail ?? '—'}</li>
       </ul>
       <p>Responde desde el panel de Stripe DENTRO DEL PLAZO que indique la disputa,
          aportando pruebas (factura, confirmación de recogida). Pasado el plazo se
          pierde automáticamente.</p>`,
    );
  }

  private statusTemplate(
    status: OrderStatus,
  ): { subject: string; html: string } | null {
    switch (status) {
      case OrderStatus.READY_FOR_PICKUP:
        return {
          subject: 'Tu pedido está listo para recoger',
          html: `<p>Tu pedido ya está preparado.</p><p>${pickupInstructions(this.config)}</p>`,
        };
      case OrderStatus.PICKED_UP:
        return {
          subject: 'Has recogido tu pedido',
          html: '<p>Confirmamos que has recogido tu pedido. ¡Gracias por comprar con nosotros!</p>',
        };
      case OrderStatus.CANCELLED:
        return {
          subject: 'Tu pedido ha sido cancelado',
          html: '<p>Tu pedido ha sido cancelado. Si tienes dudas, responde a este correo.</p>',
        };
      default:
        return null;
    }
  }

  // Envuelve el envío para que un fallo se registre pero no rompa el flujo de
  // pedido que lo dispara.
  private async safeSend(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    try {
      await this.mail.send(to, subject, html);
    } catch (err) {
      this.logger.error(
        `No se pudo enviar el email de pedido a ${to}: ${err instanceof Error ? err.message : 'error'}`,
      );
    }
  }

  private eur(cents: number): string {
    return (cents / 100).toFixed(2) + ' €';
  }
}
