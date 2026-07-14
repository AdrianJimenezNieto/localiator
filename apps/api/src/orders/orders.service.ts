import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuctionStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderMailService } from '../mail/order-mail.service';
import { CreateOrderDto, CreateOrderLineDto } from './dto/create-order.dto';
import { RESERVATION_TTL_MINUTES } from './orders.constants';

// Máquina de estados del pedido: qué transiciones son legales desde cada estado.
// Centralizarla evita estados imposibles (p. ej. CANCELLED → PICKED_UP). Las
// transiciones a PAID/CANCELLED automáticas (pago, expiración) las hacen el
// webhook (06) y el barrido (07); estas son las MANUALES del admin (recogida).
const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [],
  [OrderStatus.PAID]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED],
  [OrderStatus.READY_FOR_PICKUP]: [
    OrderStatus.PICKED_UP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PICKED_UP]: [],
  [OrderStatus.CANCELLED]: [],
};

// Fila del artículo bloqueada con SELECT ... FOR UPDATE. Solo los campos que
// necesitamos para reservar y para el snapshot de la línea.
interface LockedItemRow {
  id: string;
  stock: number;
  name: string;
  priceCents: number;
  discountCents: number;
}

// Línea ya resuelta contra BD (con precio y nombre reales), lista para persistir.
interface ResolvedLine {
  itemType: OrderItemType;
  itemId: string;
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderMail: OrderMailService,
  ) {}

  // Pedidos del comprador (para "Mis pedidos"). Incluye líneas y nº de factura.
  listMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { lines: true, invoice: { select: { number: true } } },
    });
  }

  // Listado de gestión (admin), filtrable por estado.
  listAllOrders(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        lines: true,
        user: { select: { email: true } },
        invoice: { select: { number: true } },
      },
    });
  }

  // Detalle de un pedido; el dueño (o un admin) puede verlo.
  async getOrderForUser(orderId: string, userId: string, isAdmin: boolean) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true, invoice: { select: { number: true } } },
    });
    if (!order || (!isAdmin && order.userId !== userId)) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
  }

  // Transición de estado MANUAL del admin (flujo de recogida, tarea 11). Valida
  // que la transición es legal (rechaza las imposibles con 409) y dispara el email
  // de la transición. Cancelar un pedido ya PAID NO repone stock (reembolsos
  // mínimos, gestión manual; ver CLAUDE.md).
  async transitionStatus(orderId: string, target: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    const allowed = LEGAL_TRANSITIONS[order.status];
    if (!allowed.includes(target)) {
      throw new ConflictException(
        `Transición no permitida: ${order.status} → ${target}`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: target },
    });

    // Email de la transición: tolerante a fallos (no revierte el cambio).
    await this.orderMail.sendStatusChange(orderId, target);

    return updated;
  }

  // Crea un pedido PENDING y reserva el stock de cada línea de forma ATÓMICA y con
  // expiración. Es el punto anti-condiciones-de-carrera de la Fase 3: dos clientes
  // no pueden reservar a la vez el mismo último stock.
  //
  // Anti-carrera: dentro de la transacción bloqueamos la fila del artículo con
  // `SELECT ... FOR UPDATE`. Dos pedidos que compiten por el mismo artículo se
  // SERIALIZAN en ese bloqueo; el segundo espera al commit del primero y entonces
  // ya ve su reserva al calcular el disponible. Frente a la escritura condicional
  // (`updateMany where stock >= n`), el bloqueo es más explícito y encaja con el
  // modelo "disponible = stock − reservas vivas" (no descontamos `stock` aquí; eso
  // ocurre al confirmar el pago en la tarea 06).
  async createOrder(userId: string, dto: CreateOrderDto) {
    await this.assertEmailVerified(userId);

    // El carrito podría traer líneas duplicadas del mismo artículo: las fusionamos
    // para no crear dos reservas ni calcular mal el disponible.
    const items = this.mergeDuplicates(dto.items);

    // Orden determinista al bloquear filas (por tipo+id): si dos pedidos contienen
    // los mismos artículos en distinto orden, adquirir los bloqueos siempre en el
    // mismo orden evita interbloqueos (deadlocks).
    items.sort((a, b) =>
      `${a.itemType}:${a.itemId}`.localeCompare(`${b.itemType}:${b.itemId}`),
    );

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000);

    return this.prisma.$transaction(async (tx) => {
      // Un usuario solo mantiene UN pedido PENDING vivo. Al reentrar al checkout
      // liberamos sus reservas anteriores y cancelamos esos pedidos, para que no
      // acapare stock con reintentos y para que su propio stock reservado antes
      // vuelva a estar disponible para este pedido nuevo.
      await this.cancelPriorPending(tx, userId);

      const resolved: ResolvedLine[] = [];

      for (const line of items) {
        const row = await this.lockItem(tx, line.itemType, line.itemId);
        if (!row) {
          throw new NotFoundException(
            `El artículo ${line.itemId} no existe o ya no está disponible`,
          );
        }

        const reserved = await this.liveReservedQuantity(
          tx,
          line.itemType,
          line.itemId,
        );
        const available = row.stock - reserved;
        if (line.quantity > available) {
          throw new ConflictException(
            `Sin stock suficiente de "${row.name}": quedan ${Math.max(0, available)} y pides ${line.quantity}`,
          );
        }

        const unitPriceCents = Math.max(0, row.priceCents - row.discountCents);
        resolved.push({
          itemType: line.itemType,
          itemId: line.itemId,
          nameSnapshot: row.name,
          unitPriceCents,
          quantity: line.quantity,
          lineTotalCents: unitPriceCents * line.quantity,
        });
      }

      const totalCents = resolved.reduce((sum, l) => sum + l.lineTotalCents, 0);

      const order = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          totalCents,
          currency: 'eur',
          lines: { create: resolved },
          reservations: {
            create: resolved.map((l) => ({
              itemType: l.itemType,
              itemId: l.itemId,
              quantity: l.quantity,
              expiresAt,
            })),
          },
        },
        include: { lines: true },
      });

      return {
        id: order.id,
        status: order.status,
        totalCents: order.totalCents,
        currency: order.currency,
        expiresAt,
        createdAt: order.createdAt,
        lines: order.lines.map((l) => ({
          itemType: l.itemType,
          itemId: l.itemId,
          nameSnapshot: l.nameSnapshot,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          lineTotalCents: l.lineTotalCents,
        })),
      };
    });
  }

  // Crea el pedido del GANADOR de una subasta (tarea 09). A diferencia de
  // createOrder (venta directa), NO lleva reserva de stock ni descuento: el ganador
  // ya es el único con derecho al artículo, no compite por él en un carrito. El
  // precio es la puja ganadora (snapshot), no el precio de catálogo.
  //
  // Recibe el `tx` de la transacción de cierre/reasignación (tareas 06/07) para que
  // "fijar ganador" y "crear su pedido" sean ATÓMICOS: nunca hay un ganador sin
  // pedido ni un pedido sin ganador. Por eso vive aquí (cohesión: OrdersService es
  // el dueño de Order/OrderLine) pero se ejecuta dentro de la tx de AuctionsService.
  async createAuctionOrder(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      auctionId: string;
      amountCents: number;
    },
  ): Promise<{ id: string }> {
    // El artículo subastado (tipo + id) lo toma de la propia subasta, así el llamador
    // (AuctionsService) solo aporta ganador, subasta e importe.
    const auction = await tx.auction.findUnique({
      where: { id: params.auctionId },
      select: { itemType: true, itemId: true },
    });
    if (!auction) {
      throw new NotFoundException('Subasta no encontrada');
    }

    // Segunda oportunidad (tarea 07): si ya había un pedido PENDING de esta subasta
    // (el del moroso que no pagó), lo cancelamos antes de crear el del nuevo ganador.
    // Como el pedido de subasta no tiene reserva, basta con marcarlo CANCELLED. Que
    // Order.auctionId NO sea @unique es justo lo que permite crear el nuevo aquí.
    await tx.order.updateMany({
      where: { auctionId: params.auctionId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.CANCELLED },
    });

    const nameSnapshot = await this.resolveItemName(
      tx,
      auction.itemType,
      auction.itemId,
    );

    return tx.order.create({
      data: {
        userId: params.userId,
        auctionId: params.auctionId,
        status: OrderStatus.PENDING,
        totalCents: params.amountCents,
        currency: 'eur',
        // Una sola línea, cantidad 1: el artículo subastado al precio de la puja.
        lines: {
          create: {
            itemType: auction.itemType,
            itemId: auction.itemId,
            nameSnapshot,
            unitPriceCents: params.amountCents,
            quantity: 1,
            lineTotalCents: params.amountCents,
          },
        },
        // Sin `reservations`: no pasa por reserva de stock (ver arriba).
      },
      select: { id: true },
    });
  }

  // Nombre actual del artículo para el snapshot de la línea. Sin lock (no hay
  // concurrencia de stock aquí). Fallback defensivo si el artículo se borró tras
  // crear la subasta: mejor un pedido con nombre genérico que romper el cierre.
  private async resolveItemName(
    tx: Prisma.TransactionClient,
    itemType: OrderItemType,
    itemId: string,
  ): Promise<string> {
    if (itemType === OrderItemType.PRODUCT) {
      const product = await tx.product.findUnique({
        where: { id: itemId },
        select: { name: true },
      });
      return product?.name ?? 'Artículo de subasta';
    }
    const lot = await tx.lot.findUnique({
      where: { id: itemId },
      select: { name: true },
    });
    return lot?.name ?? 'Lote de subasta';
  }

  // Carga un pedido que va a pagarse y valida que se puede: que es del usuario,
  // que sigue PENDING y que su reserva no ha expirado. Lo usa el pago (tarea 04).
  // Devuelve el pedido con sus líneas (para construir el line_items de Stripe).
  async getPayableOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true, reservations: true },
    });
    // Un pedido ajeno se trata como inexistente: no revelamos que existe.
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Pedido no encontrado');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('El pedido ya no está pendiente de pago');
    }
    // Pedido de subasta (tarea 09): no tiene reserva de stock, así que no aplica la
    // comprobación de reserva. Su plazo lo gobierna Auction.paymentDueAt (tarea 07):
    // si vence, el barrido de impago banea y reasigna; aquí no lo bloqueamos.
    if (!order.auctionId) {
      // La reserva expiró (aún sin barrer por el cron de la tarea 07): no se puede
      // pagar; hay que rehacer el pedido para volver a reservar stock.
      const now = Date.now();
      const expired = order.reservations.some(
        (r) => r.expiresAt.getTime() <= now,
      );
      if (expired || order.reservations.length === 0) {
        throw new ConflictException(
          'La reserva de stock ha expirado; vuelve a tramitar el pedido',
        );
      }
    }
    return order;
  }

  // Confirma un pedido cobrado (lo llama el webhook de Stripe, tarea 06). Es la
  // FUENTE DE VERDAD del pago, no el retorno del navegador. Idempotente y atómico:
  //  - Localiza el pedido por PaymentIntent (o por orderId de la metadata).
  //  - Si ya está PAID, no hace nada (Stripe entrega "al menos una vez" y puede
  //    reintentar el mismo evento; sin esto se descontaría stock de más).
  //  - Si no sigue PENDING (p. ej. la reserva expiró y se canceló, tarea 07), no
  //    descuenta stock: es la carrera "pago justo al expirar"; se registra para
  //    revisión manual (el reembolso queda fuera del MVP, CLAUDE.md).
  //  - Si procede: descuenta Product/Lot.stock según las líneas, consume las
  //    reservas y marca PAID + paidAt.
  // Devuelve el estado resultante para que el llamador decida efectos secundarios
  // (email de confirmación, factura) sin bloquear la respuesta a Stripe.
  async confirmOrderPaid(params: {
    paymentIntentId?: string;
    orderId?: string;
  }): Promise<{
    outcome: 'paid' | 'already_paid' | 'not_payable' | 'not_found';
    orderId?: string;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: params.paymentIntentId
          ? { stripePaymentIntentId: params.paymentIntentId }
          : { id: params.orderId },
        include: { lines: true, reservations: true },
      });

      if (!order) {
        return { outcome: 'not_found' as const };
      }
      if (order.status === OrderStatus.PAID) {
        return { outcome: 'already_paid' as const, orderId: order.id };
      }
      if (order.status !== OrderStatus.PENDING) {
        return { outcome: 'not_payable' as const, orderId: order.id };
      }

      // Pedido de SUBASTA (tarea 09): no hay reserva ni descuento de stock (el
      // ganador ya tenía el artículo asignado, no compitió por él en un carrito).
      // Además, al cobrarse, la subasta pasa a PAID: así sale del findUnpaidWinners
      // (que busca CLOSED con plazo vencido) y se apaga el impago sin código extra.
      if (order.auctionId) {
        await tx.auction.updateMany({
          // Guard idempotente: solo si sigue CLOSED. Si el impago ya la reasignó o
          // cerró (carrera "paga justo al vencer el plazo"), no la pisamos.
          where: { id: order.auctionId, status: AuctionStatus.CLOSED },
          data: { status: AuctionStatus.PAID },
        });
      } else {
        // Coherencia con la liberación de reservas (tarea 07): si la reserva ya
        // expiró (aunque el barrido aún no haya cancelado el pedido), NO confirmamos
        // el cobro, porque ese stock pudo asignarse a otro comprador y descontarlo
        // aquí provocaría sobreventa. Se marca como no pagable para revisión manual
        // (reembolso fuera del MVP, CLAUDE.md).
        const now = Date.now();
        const reservationLive =
          order.reservations.length > 0 &&
          order.reservations.every((r) => r.expiresAt.getTime() > now);
        if (!reservationLive) {
          return { outcome: 'not_payable' as const, orderId: order.id };
        }

        // Descuento REAL del stock, una sola vez, ahora que el cobro está confirmado.
        for (const line of order.lines) {
          if (line.itemType === OrderItemType.PRODUCT) {
            await tx.product.update({
              where: { id: line.itemId },
              data: { stock: { decrement: line.quantity } },
            });
          } else {
            await tx.lot.update({
              where: { id: line.itemId },
              data: { stock: { decrement: line.quantity } },
            });
          }
        }

        // La reserva ya cumplió su función; se consume.
        await tx.stockReservation.deleteMany({ where: { orderId: order.id } });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paidAt: new Date(),
          // Si llegó por metadata.orderId sin PI enlazado aún, lo fijamos ahora
          // para cerrar el enlace de conciliación (tarea 08).
          ...(params.paymentIntentId && !order.stripePaymentIntentId
            ? { stripePaymentIntentId: params.paymentIntentId }
            : {}),
        },
      });

      return { outcome: 'paid' as const, orderId: order.id };
    });
  }

  // Libera la reserva de un pedido y lo cancela (tarea 07). La usa tanto el evento
  // de pago fallido/cancelado de Stripe (liberación inmediata) como el barrido de
  // reservas expiradas. Idempotente: si el pedido ya no es PENDING, no hace nada
  // (liberar dos veces no rompe). Cancelamos el pedido (frente a dejarlo PENDING
  // sin reserva) para que la conciliación (08) y el cliente lo vean claro.
  async releaseReservation(params: {
    paymentIntentId?: string;
    orderId?: string;
  }): Promise<{ released: boolean; orderId?: string }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: params.paymentIntentId
          ? { stripePaymentIntentId: params.paymentIntentId }
          : { id: params.orderId },
        select: { id: true, status: true },
      });
      if (!order || order.status !== OrderStatus.PENDING) {
        return { released: false, orderId: order?.id };
      }
      await tx.stockReservation.deleteMany({ where: { orderId: order.id } });
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED },
      });
      return { released: true, orderId: order.id };
    });
  }

  // Barre las reservas EXPIRADAS de pedidos aún PENDING y las libera. Lo llama el
  // cron (ReservationCleanupService). Devuelve cuántos pedidos se cancelaron.
  async releaseExpiredReservations(): Promise<number> {
    const expired = await this.prisma.stockReservation.findMany({
      where: {
        expiresAt: { lt: new Date() },
        order: { status: OrderStatus.PENDING },
      },
      select: { orderId: true },
      distinct: ['orderId'],
    });

    let cancelled = 0;
    for (const { orderId } of expired) {
      const result = await this.releaseReservation({ orderId });
      if (result.released) cancelled++;
    }
    return cancelled;
  }

  // Enlaza el pedido con su PaymentIntent de Stripe (idempotencia del webhook en
  // la tarea 06 y base de la conciliación en la 08).
  async setPaymentIntent(
    orderId: string,
    paymentIntentId: string,
  ): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { stripePaymentIntentId: paymentIntentId },
    });
  }

  // Solo puede comprar quien ha verificado su email (política de CLAUDE.md,
  // anotada por el auth de Fase 1). El JWT no lleva el flag, así que se comprueba
  // en BD en el momento de la compra.
  private async assertEmailVerified(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Verifica tu email antes de realizar un pedido',
      );
    }
  }

  private mergeDuplicates(lines: CreateOrderLineDto[]): CreateOrderLineDto[] {
    const byKey = new Map<string, CreateOrderLineDto>();
    for (const line of lines) {
      const key = `${line.itemType}:${line.itemId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        byKey.set(key, { ...line });
      }
    }
    return [...byKey.values()];
  }

  private async cancelPriorPending(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const prior = await tx.order.findMany({
      where: { userId, status: OrderStatus.PENDING },
      select: { id: true },
    });
    if (prior.length === 0) return;
    const ids = prior.map((o) => o.id);
    await tx.stockReservation.deleteMany({ where: { orderId: { in: ids } } });
    await tx.order.updateMany({
      where: { id: { in: ids } },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  // Bloquea la fila del artículo (Product o Lot) con FOR UPDATE y devuelve sus
  // datos. Producto y Lote son tablas separadas, así que ramificamos la consulta.
  // `$queryRaw` parametriza el id (no hay inyección); el nombre de tabla es un
  // literal controlado por nosotros, no entrada de usuario.
  private async lockItem(
    tx: Prisma.TransactionClient,
    itemType: OrderItemType,
    itemId: string,
  ): Promise<LockedItemRow | null> {
    const rows =
      itemType === OrderItemType.PRODUCT
        ? await tx.$queryRaw<LockedItemRow[]>`
            SELECT id, stock, name, "priceCents", "discountCents"
            FROM "Product" WHERE id = ${itemId} FOR UPDATE`
        : await tx.$queryRaw<LockedItemRow[]>`
            SELECT id, stock, name, "priceCents", "discountCents"
            FROM "Lot" WHERE id = ${itemId} FOR UPDATE`;
    return rows[0] ?? null;
  }

  // Suma de las reservas VIVAS (no expiradas) de un artículo, en todos los
  // pedidos. Es el "ya comprometido" que se resta al stock para el disponible.
  private async liveReservedQuantity(
    tx: Prisma.TransactionClient,
    itemType: OrderItemType,
    itemId: string,
  ): Promise<number> {
    const agg = await tx.stockReservation.aggregate({
      _sum: { quantity: true },
      where: { itemType, itemId, expiresAt: { gt: new Date() } },
    });
    return agg._sum.quantity ?? 0;
  }
}
