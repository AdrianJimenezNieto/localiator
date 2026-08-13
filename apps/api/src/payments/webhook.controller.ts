import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { Public } from '../auth/public.decorator';
import { OrdersService } from '../orders/orders.service';
import { InvoicingService } from '../invoicing/invoicing.service';
import { OrderMailService } from '../mail/order-mail.service';
import { AuctionsService } from '../auctions/auctions.service';
import { STRIPE_CLIENT, type StripeClient } from './stripe.provider';

// Webhook de Stripe: FUENTE DE VERDAD del pago. El usuario puede cerrar la
// pestaña tras pagar; solo el webhook garantiza que nos enteramos del cobro.
//
// @Public: Stripe no lleva nuestra sesión. @SkipThrottle: no debe caer en el rate
// limiting (Stripe reintenta y puede ráfaguear). La verificación de firma es la
// que protege este endpoint abierto.
@Controller('payments')
@Public()
@SkipThrottle()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
    private readonly orders: OrdersService,
    private readonly invoicing: InvoicingService,
    private readonly orderMail: OrderMailService,
    // Aviso a los pujadores si el cobro canceló una subasta por falta de stock
    // (tarea 15). OrdersService hace la cancelación en su transacción pero no puede
    // avisar (sería un ciclo de módulos), así que el aviso se orquesta aquí, donde
    // ya se disparan los demás efectos secundarios del cobro.
    private readonly auctions: AuctionsService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!this.stripe || !secret) {
      // Sin Stripe configurado no podemos verificar la firma: rechazamos.
      throw new BadRequestException('Webhook no configurado');
    }

    // Verificar la firma exige los BYTES ORIGINALES del cuerpo (rawBody): parsear a
    // JSON antes rompería la verificación. Por eso main.ts arranca con rawBody:true.
    const raw = req.rawBody;
    if (!raw || !signature) {
      throw new BadRequestException('Falta cuerpo o firma del webhook');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(raw, signature, secret);
    } catch (err) {
      // Firma inválida (o cuerpo manipulado): 400. No revelamos detalles.
      this.logger.warn(
        `Firma de webhook inválida: ${err instanceof Error ? err.message : 'error'}`,
      );
      throw new BadRequestException('Firma de webhook inválida');
    }

    // La firma prueba que el evento viene de Stripe, pero no de QUÉ Stripe: si en
    // producción quedara colgada una clave de test (o al revés), un evento del modo
    // equivocado pasaría la verificación y confirmaría pedidos con dinero de
    // juguete. `livemode` debe casar con nuestro entorno.
    const expectLive = this.config.get<string>('NODE_ENV') === 'production';
    if (event.livemode !== expectLive) {
      this.logger.error(
        `Evento de Stripe en modo incorrecto (livemode=${event.livemode}, ` +
          `esperado ${expectLive}); ignorado. Revisa las claves de Stripe.`,
      );
      return { received: true };
    }

    // Respondemos 200 rápido en cualquier caso; los eventos que no manejamos se
    // ignoran (Stripe envía muchos tipos). El trabajo pesado (email, factura) se
    // dispara desde aquí en tareas siguientes sin bloquear esta respuesta.
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        break;
      // Pago fallido o cancelado: liberamos la reserva de inmediato en vez de
      // esperar a que expire (tarea 07), para devolver el stock cuanto antes.
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await this.onPaymentFailed(event.data.object);
        break;
      // Reembolso hecho desde el panel de Stripe (total o parcial). Stripe manda
      // este evento con el acumulado devuelto del cobro.
      case 'charge.refunded':
        await this.onChargeRefunded(event.data.object);
        break;
      // El cliente ha reclamado a su banco: el dinero queda retenido.
      case 'charge.dispute.created':
        await this.onDisputeCreated(event.data.object);
        break;
      case 'charge.dispute.closed':
        await this.onDisputeClosed(event.data.object);
        break;
    }

    return { received: true };
  }

  private async onPaymentFailed(intent: Stripe.PaymentIntent): Promise<void> {
    const result = await this.orders.releaseReservation({
      paymentIntentId: intent.id,
      orderId: intent.metadata?.orderId ?? undefined,
    });
    if (result.released) {
      this.logger.log(
        `Pago fallido/cancelado: reserva liberada y pedido ${result.orderId} cancelado`,
      );
    }
  }

  // Un Charge y una Dispute apuntan al PaymentIntent, que es nuestro enlace con el
  // pedido; además el PI arrastra la metadata que pusimos al crear la sesión, y
  // Stripe la copia al Charge. Extraemos ambas referencias para dárselas al
  // servicio, que las usa como red de seguridad (una u otra basta).
  private stripeRefsOf(source: {
    payment_intent?: string | { id: string } | null;
    metadata?: Stripe.Metadata | null;
  }): { paymentIntentId?: string; orderId?: string } {
    const pi = source.payment_intent;
    return {
      paymentIntentId: typeof pi === 'string' ? pi : (pi?.id ?? undefined),
      orderId: source.metadata?.orderId ?? undefined,
    };
  }

  private async onChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const refs = this.stripeRefsOf(charge);
    const result = await this.orders.registerRefund({
      ...refs,
      // ACUMULADO devuelto de este cobro, no el importe del último reembolso: así
      // reprocesar el evento deja el mismo valor en vez de sumar dos veces.
      amountRefundedCents: charge.amount_refunded,
    });

    switch (result.outcome) {
      case 'refunded':
      case 'partially_refunded': {
        const total = result.outcome === 'refunded';
        this.logger.log(
          `Pedido ${result.orderId} reembolsado ${total ? 'por completo' : 'parcialmente'}: ` +
            `${result.refundedCents} c de ${result.totalCents} c`,
        );
        // Aviso al cliente: best-effort, como el resto de emails.
        await this.orderMail.sendRefundNotice(
          result.orderId!,
          result.refundedCents!,
          total,
        );
        // Factura RECTIFICATIVA por el importe de ESTE reembolso (art. 15 RD
        // 1619/2012). Va en serie propia y no anula la original. Tolerante a
        // fallos, como la factura del cobro: el dinero ya se ha devuelto y no
        // podemos revertirlo porque falle la emisión del documento.
        try {
          const corrective = await this.invoicing.generateCorrective({
            orderId: result.orderId!,
            deltaCents: result.deltaCents!,
            reason: total
              ? 'Reembolso total del pedido'
              : 'Reembolso parcial del pedido',
          });
          if (corrective) {
            this.logger.log(
              `Emitida factura rectificativa ${corrective.number} del pedido ${result.orderId}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `No se pudo emitir la rectificativa del pedido ${result.orderId}: ` +
              `${err instanceof Error ? err.message : 'error'}`,
          );
        }
        break;
      }
      case 'noop':
        // Evento repetido con el mismo acumulado: nada que cambiar.
        break;
      case 'not_found':
        this.logger.error(
          `Reembolso recibido sin pedido asociado (PI=${refs.paymentIntentId ?? '—'}, ` +
            `orderId=${refs.orderId ?? '—'})`,
        );
        break;
    }
  }

  private async onDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const refs = this.stripeRefsOf(dispute);
    const result = await this.orders.openDispute(refs);

    if (result.outcome === 'not_found') {
      this.logger.error(
        `Disputa recibida sin pedido asociado (PI=${refs.paymentIntentId ?? '—'}, ` +
          `orderId=${refs.orderId ?? '—'})`,
      );
      return;
    }
    if (result.outcome === 'already_disputed') {
      return; // evento duplicado
    }

    // Nivel error a propósito: hay un plazo de respuesta y perderlo cuesta el
    // importe Y la mercancía. Debe destacar en los logs centralizados.
    this.logger.error(
      `DISPUTA abierta en el pedido ${result.orderId} (${result.totalCents} c, ` +
        `estado previo ${result.previousStatus}). Responde en Stripe dentro del plazo.`,
    );
    await this.orderMail.sendDisputeAlert({
      orderId: result.orderId!,
      totalCents: result.totalCents!,
      customerEmail: result.customerEmail,
    });
  }

  private async onDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
    const refs = this.stripeRefsOf(dispute);
    // Veredicto de Stripe. 'won' es el único desenlace en el que conservamos el
    // dinero; 'warning_closed' y demás estados intermedios no cierran nada, pero
    // este evento solo llega con la disputa ya resuelta.
    const lost = dispute.status !== 'won';
    const result = await this.orders.resolveDispute({ ...refs, lost });

    switch (result.outcome) {
      case 'lost': {
        this.logger.error(
          `Disputa PERDIDA en el pedido ${result.orderId}: el importe se ha ` +
            'devuelto al cliente.',
        );
        // Perder una disputa deja el dinero devuelto igual que un reembolso, así
        // que exige la misma rectificativa aunque no llegue un `charge.refunded`.
        try {
          const corrective = await this.invoicing.generateCorrective({
            orderId: result.orderId!,
            deltaCents: result.deltaCents ?? 0,
            reason: 'Disputa resuelta a favor del cliente (chargeback)',
          });
          if (corrective) {
            this.logger.log(
              `Emitida factura rectificativa ${corrective.number} del pedido ${result.orderId}`,
            );
          }
        } catch (err) {
          this.logger.error(
            `No se pudo emitir la rectificativa del pedido ${result.orderId}: ` +
              `${err instanceof Error ? err.message : 'error'}`,
          );
        }
        break;
      }
      case 'won':
        this.logger.log(
          `Disputa ganada en el pedido ${result.orderId}: vuelve al estado ${result.restoredStatus}`,
        );
        break;
      case 'not_disputed':
        // Ya cerrada (evento duplicado) o nunca abierta por nuestra parte.
        break;
      case 'not_found':
        this.logger.error(
          `Cierre de disputa sin pedido asociado (PI=${refs.paymentIntentId ?? '—'})`,
        );
        break;
    }
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? undefined);
    const orderId = session.metadata?.orderId ?? undefined;

    // `checkout.session.completed` NO significa "cobrado". Con métodos de pago
    // asíncronos (domiciliación SEPA, transferencia, Klarna… todos activables con
    // un clic en el panel de Stripe) la sesión se completa con payment_status
    // 'unpaid' y el dinero llega —o no— días después, en un evento aparte
    // (async_payment_succeeded/failed). Confirmar aquí sin mirarlo entregaba el
    // pedido antes de cobrar, y gratis si el pago acababa fallando.
    if (session.payment_status !== 'paid') {
      this.logger.warn(
        `Sesión ${session.id} completada con payment_status='${session.payment_status}' ` +
          `(pedido ${orderId ?? '—'}): no se confirma hasta que el cobro sea efectivo`,
      );
      return;
    }

    const result = await this.orders.confirmOrderPaid({
      paymentIntentId,
      orderId,
      // Lo realmente cobrado, según Stripe. OrdersService lo contrasta con el
      // total del pedido y se niega a entregar si no cuadra.
      amountPaidCents: session.amount_total ?? undefined,
      currency: session.currency ?? undefined,
    });

    switch (result.outcome) {
      case 'paid':
        this.logger.log(`Pedido ${result.orderId} confirmado como PAID`);
        // Genera la factura (tarea 09). No bloquea ni revierte la confirmación:
        // el pago ya ocurrió; si la factura falla, se registra y se puede
        // regenerar después (la generación es idempotente por orderId).
        if (result.orderId) {
          try {
            // La factura primero (el email la referencia), luego la confirmación.
            await this.invoicing.generateForOrder(result.orderId);
          } catch (err) {
            this.logger.error(
              `No se pudo generar la factura del pedido ${result.orderId}: ${err instanceof Error ? err.message : 'error'}`,
            );
          }
          // Email de confirmación: tolerante a fallos (no revierte el pedido).
          await this.orderMail.sendOrderConfirmation(result.orderId);
        }
        // Esta venta directa agotó el artículo de una subasta viva: ya se canceló
        // en la transacción del cobro; aquí se avisa a quienes pujaban (tarea 15).
        for (const auctionId of result.cancelledAuctionIds ?? []) {
          this.logger.log(
            `Subasta ${auctionId} cancelada: el artículo se agotó en una venta directa`,
          );
          await this.auctions.notifyAuctionCancelled(auctionId);
        }
        break;
      case 'already_paid':
        // Idempotencia: evento duplicado, no se hace nada.
        break;
      case 'not_payable':
        // Carrera "pago justo al expirar": el pedido ya no era PENDING.
        this.logger.error(
          `Cobro recibido para pedido ${result.orderId} no pagable (¿reserva expirada?); revisar manualmente`,
        );
        break;
      case 'amount_mismatch':
        // Cobro que no cuadra con el pedido: NO se entrega. Queda el dinero en
        // Stripe y el pedido PENDING, para revisión y reembolso manual.
        this.logger.error(
          `Importe cobrado distinto del pedido ${result.orderId}: esperado ` +
            `${result.expectedCents} c, recibido ${result.receivedCents} c ` +
            `(PI=${paymentIntentId ?? '—'}). NO se ha confirmado; revisar manualmente`,
        );
        break;
      case 'not_found':
        this.logger.error(
          `Cobro recibido sin pedido asociado (PI=${paymentIntentId ?? '—'}, orderId=${orderId ?? '—'})`,
        );
        break;
    }
  }
}
