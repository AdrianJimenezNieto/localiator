import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderItemType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, CreateOrderLineDto } from './dto/create-order.dto';
import { RESERVATION_TTL_MINUTES } from './orders.constants';

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
  constructor(private readonly prisma: PrismaService) {}

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
