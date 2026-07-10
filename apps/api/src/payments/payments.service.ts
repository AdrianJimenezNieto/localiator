import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { OrdersService } from '../orders/orders.service';
import { STRIPE_CLIENT, type StripeClient } from './stripe.provider';

// Orquesta el pago de un pedido con Stripe. Decisión (tarea 04): Checkout Session
// ALOJADA por Stripe, no Payment Intents + Elements. Menos superficie PCI (no
// tocamos datos de tarjeta), menos UI que mantener y wallets (Apple/Google Pay)
// sin trabajo extra. Ambas cuestan solo comisión por transacción, sin cuota.
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  // Crea la Checkout Session para un pedido PENDING válido y devuelve la URL a la
  // que el front redirige al cliente. El importe se toma del pedido (BD), nunca
  // de un valor que mande el cliente, para que no se pueda pagar de menos.
  async createCheckoutSession(
    orderId: string,
    userId: string,
  ): Promise<{ url: string }> {
    if (!this.stripe) {
      // Sin clave configurada no hay pago posible; error claro (no un 500 opaco).
      throw new ServiceUnavailableException(
        'El pago no está disponible: falta configurar Stripe',
      );
    }

    // Valida propiedad, estado PENDING y reserva no expirada (lanza 404/409).
    const order = await this.orders.getPayableOrder(orderId, userId);

    const appUrl =
      this.config.get<string>('APP_URL') ?? 'http://localhost:5173';

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      order.lines.map((line) => ({
        price_data: {
          currency: order.currency,
          product_data: { name: line.nameSnapshot },
          unit_amount: line.unitPriceCents, // céntimos: la unidad mínima de Stripe.
        },
        quantity: line.quantity,
      }));

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      // metadata (en la sesión Y en el PaymentIntent) enlaza el cobro con nuestro
      // pedido para el webhook (06) y la conciliación (08).
      metadata: { orderId },
      payment_intent_data: { metadata: { orderId } },
      success_url: `${appUrl}/checkout/resultado?order=${orderId}&status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/resultado?order=${orderId}&status=cancel`,
    });

    // En modo 'payment' la sesión trae ya el id del PaymentIntent. Lo guardamos en
    // el pedido: es la clave de idempotencia del webhook y el enlace de conciliación.
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (paymentIntentId) {
      await this.orders.setPaymentIntent(orderId, paymentIntentId);
    } else {
      this.logger.warn(
        `La sesión ${session.id} no devolvió payment_intent; la conciliación se apoyará en metadata.orderId`,
      );
    }

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe no devolvió una URL de pago',
      );
    }
    return { url: session.url };
  }
}
