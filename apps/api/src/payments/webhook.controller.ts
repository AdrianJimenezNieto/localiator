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

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? undefined);
    const orderId = session.metadata?.orderId ?? undefined;

    const result = await this.orders.confirmOrderPaid({
      paymentIntentId,
      orderId,
    });

    switch (result.outcome) {
      case 'paid':
        this.logger.log(`Pedido ${result.orderId} confirmado como PAID`);
        // Genera la factura (tarea 09). No bloquea ni revierte la confirmación:
        // el pago ya ocurrió; si la factura falla, se registra y se puede
        // regenerar después (la generación es idempotente por orderId).
        if (result.orderId) {
          try {
            await this.invoicing.generateForOrder(result.orderId);
          } catch (err) {
            this.logger.error(
              `No se pudo generar la factura del pedido ${result.orderId}: ${err instanceof Error ? err.message : 'error'}`,
            );
          }
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
      case 'not_found':
        this.logger.error(
          `Cobro recibido sin pedido asociado (PI=${paymentIntentId ?? '—'}, orderId=${orderId ?? '—'})`,
        );
        break;
    }
  }
}
