import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_CLIENT, type StripeClient } from './stripe.provider';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';

// Un descuadre entre lo que dice nuestra BD y lo que dice Stripe.
export interface Discrepancy {
  type: 'paid_without_stripe' | 'stripe_without_order' | 'amount_mismatch';
  orderId?: string;
  paymentIntentId?: string;
  orderTotalCents?: number;
  stripeAmountCents?: number;
}

export interface ReconciliationReport {
  from: string;
  to: string;
  matched: number; // pedidos PAID que cuadran con un cobro de Stripe.
  discrepancies: Discrepancy[];
}

// Conciliación pago recibido ↔ pedido registrado (tarea 08). Herramienta de ADMIN
// bajo demanda (no un endpoint público ni un job continuo): cruza nuestros
// pedidos PAID con los cobros de Stripe en un rango y detecta descuadres. Fuente
// de verdad del cobro = Stripe; nuestro PAID debería ser siempre consecuencia del
// webhook (tarea 06).
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private readonly stripe: StripeClient,
  ) {}

  async reconcile(
    query: ReconciliationQueryDto,
  ): Promise<ReconciliationReport> {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'La conciliación no está disponible: falta configurar Stripe',
      );
    }

    // Rango por defecto: últimos 30 días.
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Nuestros pedidos PAID en el rango (por fecha de pago).
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PAID, paidAt: { gte: from, lte: to } },
      select: { id: true, totalCents: true, stripePaymentIntentId: true },
    });

    // Cobros CONSEGUIDOS en Stripe en el mismo rango.
    const intents = await this.listSucceededIntents(
      Math.floor(from.getTime() / 1000),
      Math.floor(to.getTime() / 1000),
    );

    const intentById = new Map(intents.map((pi) => [pi.id, pi]));
    const ordersByPi = new Map(
      orders
        .filter((o) => o.stripePaymentIntentId)
        .map((o) => [o.stripePaymentIntentId as string, o]),
    );

    const discrepancies: Discrepancy[] = [];
    let matched = 0;

    // 1) Desde nuestros pedidos: ¿tienen cobro en Stripe? ¿cuadra el importe?
    for (const order of orders) {
      const pi = order.stripePaymentIntentId
        ? intentById.get(order.stripePaymentIntentId)
        : undefined;
      if (!pi) {
        discrepancies.push({
          type: 'paid_without_stripe',
          orderId: order.id,
          paymentIntentId: order.stripePaymentIntentId ?? undefined,
          orderTotalCents: order.totalCents,
        });
        continue;
      }
      if (pi.amount !== order.totalCents) {
        discrepancies.push({
          type: 'amount_mismatch',
          orderId: order.id,
          paymentIntentId: pi.id,
          orderTotalCents: order.totalCents,
          stripeAmountCents: pi.amount,
        });
        continue;
      }
      matched++;
    }

    // 2) Desde Stripe: ¿hay cobros sin pedido PAID nuestro?
    for (const pi of intents) {
      if (!ordersByPi.has(pi.id)) {
        discrepancies.push({
          type: 'stripe_without_order',
          paymentIntentId: pi.id,
          stripeAmountCents: pi.amount,
        });
      }
    }

    if (discrepancies.length > 0) {
      this.logger.warn(
        `Conciliación ${from.toISOString()}–${to.toISOString()}: ${discrepancies.length} descuadre(s) detectado(s)`,
      );
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      matched,
      discrepancies,
    };
  }

  // Pagina los PaymentIntents de Stripe en el rango y se queda con los que han
  // cobrado (succeeded). Cap defensivo de páginas para no llamar sin fin.
  private async listSucceededIntents(
    fromUnix: number,
    toUnix: number,
  ): Promise<Stripe.PaymentIntent[]> {
    const stripe = this.stripe;
    if (!stripe) return [];
    const results: Stripe.PaymentIntent[] = [];
    let startingAfter: string | undefined;

    for (let page = 0; page < 20; page++) {
      const res: Stripe.ApiList<Stripe.PaymentIntent> =
        await stripe.paymentIntents.list({
          created: { gte: fromUnix, lte: toUnix },
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
      results.push(...res.data);
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }

    return results.filter((pi) => pi.status === 'succeeded');
  }
}
