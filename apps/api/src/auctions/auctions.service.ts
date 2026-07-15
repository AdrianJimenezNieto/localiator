import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AuctionStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import type { AuctionListItem, Paginated } from '@localiator/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionsGateway } from './auctions.gateway';
import { maskBidder } from './auctions.mask';
import {
  ANTISNIPE_WINDOW_MS,
  PAYMENT_WINDOW_MS,
  ENDING_SOON_WINDOW_MS,
} from './auctions.constants';
import { AuctionMailService } from '../mail/auction-mail.service';
import { OrdersService } from '../orders/orders.service';
import { PlaceBidDto } from './dto/place-bid.dto';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import {
  DEFAULT_AUCTION_PAGE_SIZE,
  ListAuctionsDto,
} from './dto/list-auctions.dto';

// Motivos estables de rechazo de una puja. Se envían como `code` en el 409 para
// que el front dé feedback útil sin parsear el mensaje (que es solo humano).
export const BidRejectReason = {
  AUCTION_CLOSED: 'AUCTION_CLOSED', // no LIVE, o fuera de la ventana startsAt–endsAt.
  BID_TOO_LOW: 'BID_TOO_LOW', // no supera precio de salida / máxima + incremento.
  SELF_OUTBID: 'SELF_OUTBID', // el pujador ya es el líder actual.
  OUTBID: 'OUTBID', // era válida al enviarla, pero otra puja te adelantó (carrera).
  BANNED: 'BANNED', // usuario baneado por impago (tarea 07).
} as const;

// Los campos de la subasta que necesitan las validaciones de puja. Sirve tanto
// para la fila leída con findUnique (fast path) como para la bloqueada con
// SELECT ... FOR UPDATE (fase autoritativa): ambas comparten esta forma.
interface BiddableAuction {
  status: string;
  startsAt: Date;
  endsAt: Date;
  startingPriceCents: number;
  minIncrementCents: number;
}

// Motivos estables de rechazo de las operaciones de admin (tarea 11). Se envían
// como `code`, igual que BidRejectReason, para que el backoffice traduzca a
// lenguaje humano sin parsear el mensaje.
export const AuctionAdminReason = {
  ITEM_NOT_FOUND: 'ITEM_NOT_FOUND', // el Product/Lot del itemId no existe.
  INVALID_DATES: 'INVALID_DATES', // startsAt >= endsAt, o endsAt ya pasado.
  AUCTION_ALREADY_ACTIVE: 'AUCTION_ALREADY_ACTIVE', // ya hay una viva sobre el artículo.
  INVALID_TRANSITION: 'INVALID_TRANSITION', // la operación no cabe en este estado.
  AUCTION_HAS_BIDS: 'AUCTION_HAS_BIDS', // hay pujas: las reglas ya no se tocan.
} as const;

// Resultado de intentar abrir una subasta programada (tarea 10). Mismo criterio
// que CloseResult: los outcomes "no apertura" hacen la idempotencia explícita.
export type OpenResult =
  | { outcome: 'not_found' }
  | { outcome: 'noop' } // ya no estaba SCHEDULED (otra pasada la abrió).
  | { outcome: 'not_due' } // aún no ha llegado su `startsAt`.
  | { outcome: 'opened' } // SCHEDULED → LIVE: ya acepta pujas.
  | { outcome: 'closed_expired' }; // se le pasó la hora entera: SCHEDULED → CLOSED.

// Resultado de intentar cerrar una subasta (tarea 06). Los outcomes "no cierre"
// (not_found/noop/not_due) hacen que la idempotencia sea explícita y testeable.
export type CloseResult =
  | { outcome: 'not_found' }
  | { outcome: 'noop' } // ya no estaba LIVE (cerrada antes).
  | { outcome: 'not_due' } // el antisniping movió endsAt al futuro.
  | { outcome: 'closed_empty' } // cerrada sin pujas: desierta.
  | {
      outcome: 'closed_won';
      winnerUserId: string;
      winningBidId: string;
      amountCents: number;
    };

// Resultado de procesar el impago del ganador de una subasta (tarea 07). Como en
// CloseResult, los outcomes "no acción" hacen la idempotencia explícita y testeable.
export type UnpaidResult =
  | { outcome: 'not_found' }
  | { outcome: 'noop' } // ya no está CLOSED (pagada/cancelada) o ya no tiene ganador.
  | { outcome: 'not_due' } // el plazo de pago aún no ha vencido.
  | {
      outcome: 'reassigned'; // moroso baneado; la subasta pasa al siguiente pujador.
      bannedUserId: string;
      winnerUserId: string;
      winningBidId: string;
      amountCents: number;
    }
  | { outcome: 'cancelled_empty'; bannedUserId: string }; // baneado y sin más pujadores: desierta.

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    // forwardRef: el gateway también depende de este servicio (procesa el mensaje
    // `bid` delegando aquí), así que hay ciclo. NestJS lo rompe resolviendo esta
    // referencia de forma diferida. El servicio es el ÚNICO punto de emisión: así
    // una puja por HTTP o por WS llega igual a los espectadores.
    @Inject(forwardRef(() => AuctionsGateway))
    private readonly gateway: AuctionsGateway,
    // Emails de subasta (tarea 08): respaldo del WS para superado/ganado/impago.
    private readonly mail: AuctionMailService,
    // Cobro del ganador (tarea 09): crea su pedido dentro de la misma transacción
    // de cierre/reasignación, para que ganador y pedido sean atómicos.
    private readonly orders: OrdersService,
  ) {}

  // --- Gestión de admin (tarea 11) ---------------------------------------
  // Hasta aquí las subastas solo nacían del seed: no había forma de crearlas. Lo
  // que sigue es la puerta de alta/edición/cancelación, solo para ADMIN (el guard
  // lo pone el controlador).

  // Crea una subasta programada sobre un producto o lote existente.
  //
  // Nace SIEMPRE `SCHEDULED`, aunque su `startsAt` ya haya pasado: abrirla es
  // competencia del cron de apertura (tarea 10), que lo hará en la siguiente
  // pasada. Así hay UN solo sitio que decide cuándo una subasta está viva, en vez
  // de dos criterios que pueden divergir.
  async createAuction(dto: CreateAuctionDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertValidWindow(startsAt, endsAt);
    await this.assertItemExists(dto.itemType, dto.itemId);
    await this.assertNoActiveAuction(dto.itemType, dto.itemId);

    return this.prisma.auction.create({
      data: {
        itemType: dto.itemType,
        itemId: dto.itemId,
        startingPriceCents: dto.startingPriceCents,
        minIncrementCents: dto.minIncrementCents,
        startsAt,
        endsAt,
        status: AuctionStatus.SCHEDULED,
      },
    });
  }

  // Listado de subastas para el backoffice, con el nombre del artículo y el precio
  // actual ya resueltos. A diferencia del listado público (tarea 12) incluye todos
  // los estados y el ganador sin enmascarar: es una vista interna.
  async listAuctionsForAdmin(status?: AuctionStatus) {
    const rows = await this.prisma.auction.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        // La puja más alta trae el precio actual sin una consulta por fila (N+1).
        bids: { orderBy: { amountCents: 'desc' }, take: 1 },
        // El backoffice necesita saber si hay pujas para deshabilitar los campos
        // que ya no se pueden tocar (ver updateAuction).
        _count: { select: { bids: true } },
        winner: { select: { id: true, email: true } },
      },
    });
    const items = await this.resolveItems(rows);
    return rows.map((row) => ({
      id: row.id,
      itemType: row.itemType,
      itemId: row.itemId,
      itemName: items.get(this.itemKey(row))?.name ?? null,
      status: row.status,
      startingPriceCents: row.startingPriceCents,
      minIncrementCents: row.minIncrementCents,
      currentPriceCents: row.bids[0]?.amountCents ?? row.startingPriceCents,
      bidCount: row._count.bids,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      winner: row.winner,
      paymentDueAt: row.paymentDueAt,
    }));
  }

  // Edita una subasta. Qué se puede tocar depende del estado, y es la regla
  // interesante de esta tarea:
  //  - SCHEDULED: todo. Nadie ha pujado ni podía hacerlo.
  //  - LIVE sin pujas: todo. Está abierta, pero nadie se ha comprometido aún.
  //  - LIVE con pujas: solo ALARGAR `endsAt`. Cambiar el precio de salida o el
  //    incremento cambiaría las reglas a mitad de partida e invalidaría pujas ya
  //    hechas bajo las reglas viejas; acortar el cierre sería un sniping legal del
  //    propio admin. Alargar no perjudica a nadie que ya pujó.
  //  - CLOSED/PAID/CANCELLED: nada. Ya no es una subasta en curso.
  async updateAuction(auctionId: string, dto: UpdateAuctionDto) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction) {
      throw new NotFoundException('Subasta no encontrada');
    }
    if (
      auction.status !== AuctionStatus.SCHEDULED &&
      auction.status !== AuctionStatus.LIVE
    ) {
      throw this.reject(
        AuctionAdminReason.INVALID_TRANSITION,
        'Solo se puede editar una subasta programada o en curso',
      );
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : auction.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : auction.endsAt;
    this.assertValidWindow(startsAt, endsAt);

    const hasBids = (await this.highestBid(this.prisma, auctionId)) !== null;
    if (hasBids) {
      const touchesRules =
        (dto.startingPriceCents !== undefined &&
          dto.startingPriceCents !== auction.startingPriceCents) ||
        (dto.minIncrementCents !== undefined &&
          dto.minIncrementCents !== auction.minIncrementCents) ||
        (dto.startsAt !== undefined &&
          startsAt.getTime() !== auction.startsAt.getTime());
      if (touchesRules) {
        throw this.reject(
          AuctionAdminReason.AUCTION_HAS_BIDS,
          'La subasta ya tiene pujas: no se pueden cambiar sus reglas ni su inicio',
        );
      }
      if (dto.endsAt && endsAt.getTime() < auction.endsAt.getTime()) {
        throw this.reject(
          AuctionAdminReason.AUCTION_HAS_BIDS,
          'La subasta ya tiene pujas: el cierre solo se puede alargar',
        );
      }
    }

    const updated = await this.prisma.auction.update({
      where: { id: auctionId },
      data: {
        startingPriceCents: dto.startingPriceCents,
        minIncrementCents: dto.minIncrementCents,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        // Si se mueve el cierre, el aviso de "a punto de cerrar" ya no vale y hay
        // que poder reavisar con la nueva fecha. Mismo criterio que el antisniping.
        endingSoonNotifiedAt: dto.endsAt ? null : undefined,
      },
    });

    // Si el cierre cambió, los relojes del front deben enterarse: la verdad del
    // endsAt está en el servidor. Se reutiliza el evento del antisniping.
    if (dto.endsAt && endsAt.getTime() !== auction.endsAt.getTime()) {
      this.gateway.broadcastExtended(auctionId, endsAt);
    }
    return updated;
  }

  // Cancela una subasta. Una CLOSED con ganador NO se cancela por aquí: ese camino
  // es el del impago (tarea 07), que además banea y ofrece segunda oportunidad;
  // permitir cancelarla a mano se saltaría esa lógica y dejaría el pedido del
  // ganador huérfano.
  async cancelAuction(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { status: true },
    });
    if (!auction) {
      throw new NotFoundException('Subasta no encontrada');
    }
    if (
      auction.status !== AuctionStatus.SCHEDULED &&
      auction.status !== AuctionStatus.LIVE
    ) {
      throw this.reject(
        AuctionAdminReason.INVALID_TRANSITION,
        'Solo se puede cancelar una subasta programada o en curso',
      );
    }

    const cancelled = await this.prisma.auction.update({
      where: { id: auctionId },
      data: { status: AuctionStatus.CANCELLED },
    });

    // Quien esté mirando la ficha se entera al momento: puede haber gente con
    // pujas puestas. Se reutiliza `auction:closed` sin ganador (el front ya lo
    // pinta como "cerrada sin ganador") en vez de añadir un evento nuevo.
    this.gateway.broadcastClosed(auctionId, {
      winnerMasked: null,
      amountCents: null,
    });
    return cancelled;
  }

  // La ventana temporal tiene que tener sentido: no se puede cerrar antes de
  // empezar, ni programar una subasta que nace ya vencida.
  private assertValidWindow(startsAt: Date, endsAt: Date): void {
    if (startsAt.getTime() >= endsAt.getTime()) {
      throw this.badRequest(
        AuctionAdminReason.INVALID_DATES,
        'La subasta debe cerrar después de empezar',
      );
    }
    if (endsAt.getTime() <= Date.now()) {
      throw this.badRequest(
        AuctionAdminReason.INVALID_DATES,
        'La fecha de cierre debe estar en el futuro',
      );
    }
  }

  // `itemType`/`itemId` es polimórfico y NO hay FK real (tarea 01), así que Prisma
  // no puede garantizar que el artículo exista: si no se comprueba aquí, se crearía
  // una subasta apuntando al vacío y reventaría al cerrar, buscando el nombre para
  // el pedido del ganador. Este es el precio del diseño polimórfico.
  private async assertItemExists(
    itemType: OrderItemType,
    itemId: string,
  ): Promise<void> {
    const exists =
      itemType === OrderItemType.PRODUCT
        ? await this.prisma.product.findUnique({
            where: { id: itemId },
            select: { id: true },
          })
        : await this.prisma.lot.findUnique({
            where: { id: itemId },
            select: { id: true },
          });
    if (!exists) {
      throw this.badRequest(
        AuctionAdminReason.ITEM_NOT_FOUND,
        'El artículo que quieres subastar no existe',
      );
    }
  }

  // Un artículo no puede estar en dos subastas vivas a la vez: se vendería dos
  // veces. Se aprovecha el índice [itemType, itemId] de la tarea 01.
  //
  // Es un check-then-insert, así que en teoría dos altas simultáneas del mismo
  // artículo podrían colarse. No se blinda con un índice único parcial porque el
  // alta es una acción de admin (un puñado al día, sin concurrencia real) y la
  // subasta duplicada se ve y se cancela; el coste de la migración no se paga.
  private async assertNoActiveAuction(
    itemType: OrderItemType,
    itemId: string,
  ): Promise<void> {
    const active = await this.prisma.auction.findFirst({
      where: {
        itemType,
        itemId,
        status: { in: [AuctionStatus.SCHEDULED, AuctionStatus.LIVE] },
      },
      select: { id: true },
    });
    if (active) {
      throw this.reject(
        AuctionAdminReason.AUCTION_ALREADY_ACTIVE,
        'Ese artículo ya tiene una subasta programada o en curso',
      );
    }
  }

  // Resuelve nombre y portada de los artículos de un lote de subastas EN BLOQUE:
  // dos consultas (una por tabla) en vez de una por subasta. Como itemType/itemId
  // no tiene FK (tarea 01), Prisma no puede hacer el `include` y hay que cruzarlo a
  // mano; hacerlo fila a fila sería un N+1 en el camino del listado.
  private async resolveItems(
    rows: { itemType: OrderItemType; itemId: string }[],
  ): Promise<Map<string, { name: string; photo: string | null }>> {
    const productIds = rows
      .filter((r) => r.itemType === OrderItemType.PRODUCT)
      .map((r) => r.itemId);
    const lotIds = rows
      .filter((r) => r.itemType === OrderItemType.LOT)
      .map((r) => r.itemId);

    const [products, lots] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, photos: true },
          })
        : Promise.resolve([]),
      lotIds.length
        ? this.prisma.lot.findMany({
            where: { id: { in: lotIds } },
            select: { id: true, name: true, photos: true },
          })
        : Promise.resolve([]),
    ]);

    const items = new Map<string, { name: string; photo: string | null }>();
    for (const p of products) {
      items.set(`${OrderItemType.PRODUCT}:${p.id}`, {
        name: p.name,
        photo: p.photos[0] ?? null,
      });
    }
    for (const l of lots) {
      items.set(`${OrderItemType.LOT}:${l.id}`, {
        name: l.name,
        photo: l.photos[0] ?? null,
      });
    }
    return items;
  }

  private itemKey(row: { itemType: OrderItemType; itemId: string }): string {
    return `${row.itemType}:${row.itemId}`;
  }

  // 400 con motivo estable en `code`, para entrada inválida (artículo inexistente,
  // fechas incoherentes). Los conflictos de estado usan `reject` (409).
  private badRequest(code: string, message: string): BadRequestException {
    return new BadRequestException({ code, message });
  }

  // --- Lectura pública (tarea 12) -----------------------------------------

  // Listado público y paginado de subastas: lo que permite DESCUBRIRLAS. Hasta
  // esta tarea la única forma de llegar a una subasta era escribir su id en la URL.
  //
  // Por defecto solo salen LIVE y SCHEDULED (lo que se puede pujar o se va a poder).
  // Las CLOSED se pueden pedir explícitamente; PAID y CANCELLED no salen nunca (el
  // DTO las rechaza): son estado interno que no aporta a quien mira el listado.
  //
  // NO devuelve identidades de pujadores, ni siquiera enmascaradas: la tarjeta no
  // las necesita y un listado público es el peor sitio para filtrar datos de más.
  async listPublicAuctions(
    dto: ListAuctionsDto,
  ): Promise<Paginated<AuctionListItem>> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? DEFAULT_AUCTION_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuctionWhereInput = {
      status: {
        in: dto.status ?? [AuctionStatus.LIVE, AuctionStatus.SCHEDULED],
      },
    };

    // findMany + count en la MISMA transacción → el `total` es coherente con la
    // página devuelta aunque entren escrituras concurrentes entre ambas consultas.
    // Mismo criterio que el catálogo (catalog.service.ts).
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auction.findMany({
        where,
        // "Cierra antes" primero: es el orden útil en subastas (lo que urge) y es
        // estable, así que la paginación no baila entre páginas.
        orderBy: { endsAt: 'asc' },
        skip,
        take: pageSize,
        include: {
          // La puja más alta da el precio actual sin una consulta por fila (N+1).
          // Se apoya en el índice [auctionId, amountCents] de la tarea 01.
          bids: { orderBy: { amountCents: 'desc' }, take: 1 },
          _count: { select: { bids: true } },
        },
      }),
      this.prisma.auction.count({ where }),
    ]);

    const items = await this.resolveItems(rows);
    return {
      items: rows.map((row) => {
        const item = items.get(this.itemKey(row));
        return {
          id: row.id,
          status: row.status,
          // Literales y no la constante ItemKind de shared: la API solo puede
          // importar TIPOS de shared, no valores en runtime (ts-jest no transforma
          // node_modules). Mismo criterio que itemPath en seo.service.ts. El tipo
          // AuctionListItem obliga a que estos literales sigan siendo válidos.
          itemKind: row.itemType === OrderItemType.PRODUCT ? 'product' : 'lot',
          itemId: row.itemId,
          // El artículo debería existir siempre (el alta lo valida, tarea 11);
          // el fallback evita que una fila huérfana tumbe el listado entero.
          name: item?.name ?? 'Artículo no disponible',
          photo: item?.photo ?? null,
          currentPriceCents: row.bids[0]?.amountCents ?? row.startingPriceCents,
          startingPriceCents: row.startingPriceCents,
          minIncrementCents: row.minIncrementCents,
          bidCount: row._count.bids,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  // Estado inicial que se envía a un socket al unirse a la subasta (evento
  // `auction:state`), para que el front pinte sin un GET REST aparte. Solo datos
  // públicos + identidad enmascarada de los postores (RGPD).
  async getAuctionState(auctionId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!auction) {
      throw new NotFoundException('Subasta no encontrada');
    }
    const highest = auction.bids.reduce<(typeof auction.bids)[number] | null>(
      (max, b) => (!max || b.amountCents > max.amountCents ? b : max),
      null,
    );
    return {
      id: auction.id,
      status: auction.status,
      startingPriceCents: auction.startingPriceCents,
      minIncrementCents: auction.minIncrementCents,
      endsAt: auction.endsAt,
      highestBidCents: highest?.amountCents ?? null,
      bids: auction.bids.map((b) => ({
        amountCents: b.amountCents,
        userMasked: maskBidder(b.userId),
        createdAt: b.createdAt,
      })),
    };
  }

  // Subastas programadas a las que ya les ha llegado su hora: candidatas a abrirse
  // (tarea 10). Lo consulta el cron (AuctionsLifecycle), simétrico a findDueAuctions.
  async findStartingAuctions(): Promise<string[]> {
    const rows = await this.prisma.auction.findMany({
      where: { status: AuctionStatus.SCHEDULED, startsAt: { lte: new Date() } },
      select: { id: true },
    });
    return rows.map((a) => a.id);
  }

  // Abre una subasta programada (SCHEDULED → LIVE) para que empiece a aceptar pujas.
  // Sin esto, `assertOpen` rechazaría toda puja con AUCTION_CLOSED y una subasta
  // creada desde el admin (tarea 11) no despertaría nunca.
  //
  // A diferencia del cierre, aquí NO hace falta lock de fila (SELECT ... FOR UPDATE):
  // no leemos-modificamos datos en disputa (no hay pujas ni ganador que calcular),
  // solo movemos el estado. Basta un `updateMany` CONDICIONAL por `status: SCHEDULED`,
  // que es atómico: si dos pasadas del cron coinciden, solo una obtiene count === 1 y
  // la otra ve `noop`. Mismo patrón de "reclamar de forma atómica" que notifyEndingSoon.
  //
  // Caso borde: una subasta puede llegar aquí con `startsAt` Y `endsAt` ya pasados (la
  // API estuvo caída todo su intervalo). No se abre para cerrarla al minuto siguiente
  // —sería mentir a quien la mire y permitiría pujas en una subasta que ya debía estar
  // cerrada—: pasa directa a CLOSED y desierta. No puede tener pujas (nunca estuvo
  // LIVE), así que no hay ganador que fijar ni pedido que crear.
  async openAuction(auctionId: string): Promise<OpenResult> {
    const now = new Date();
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { status: true, startsAt: true, endsAt: true },
    });
    if (!auction) {
      return { outcome: 'not_found' };
    }
    // Idempotencia: solo se abre lo que sigue programado.
    if (auction.status !== AuctionStatus.SCHEDULED) {
      return { outcome: 'noop' };
    }
    if (auction.startsAt.getTime() > now.getTime()) {
      return { outcome: 'not_due' };
    }

    const expired = auction.endsAt.getTime() <= now.getTime();
    const claimed = await this.prisma.auction.updateMany({
      where: {
        id: auctionId,
        status: AuctionStatus.SCHEDULED,
        startsAt: { lte: now },
      },
      data: expired
        ? { status: AuctionStatus.CLOSED }
        : { status: AuctionStatus.LIVE },
    });
    if (claimed.count === 0) {
      return { outcome: 'noop' }; // otra pasada la reclamó primero.
    }

    if (expired) {
      this.gateway.broadcastClosed(auctionId, {
        winnerMasked: null,
        amountCents: null,
      });
      return { outcome: 'closed_expired' };
    }
    // Quien ya estuviera mirando la ficha ve abrirse la subasta sin recargar.
    this.gateway.broadcastOpened(auctionId, auction.endsAt);
    return { outcome: 'opened' };
  }

  // Subastas vencidas que aún siguen LIVE: candidatas a cerrarse. Lo consulta el
  // cron (AuctionsLifecycle). `endsAt <= now` respeta el antisniping porque una
  // extensión ya habría movido `endsAt` al futuro y no saldría aquí.
  async findDueAuctions(): Promise<string[]> {
    const due = await this.prisma.auction.findMany({
      where: { status: AuctionStatus.LIVE, endsAt: { lte: new Date() } },
      select: { id: true },
    });
    return due.map((a) => a.id);
  }

  // Subastas LIVE a punto de cerrar a las que aún no se ha avisado (tarea 08):
  // dentro de la ventana `ENDING_SOON_WINDOW_MS` y con el guard `endingSoonNotifiedAt`
  // sin marcar. `endsAt > now` excluye las ya vencidas (esas las cierra el otro cron).
  // Lo consulta el cron de avisos (AuctionsCloser).
  async findEndingSoon(): Promise<string[]> {
    const now = new Date();
    const rows = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.LIVE,
        endingSoonNotifiedAt: null,
        endsAt: {
          gt: now,
          lte: new Date(now.getTime() + ENDING_SOON_WINDOW_MS),
        },
      },
      select: { id: true },
    });
    return rows.map((a) => a.id);
  }

  // Avisa de que una subasta está a punto de cerrar (tarea 08). El guard es un
  // `updateMany` condicional (no un lock de fila): marca `endingSoonNotifiedAt` solo
  // si seguía sin marcar y en ventana. Es ATÓMICO e IDEMPOTENTE, así que dos pasadas
  // del cron solapadas no avisan dos veces: solo la que "gana" la marca (count === 1)
  // emite. Reclamar-antes-de-emitir evita el email duplicado si emitir tarda.
  async notifyEndingSoon(auctionId: string): Promise<boolean> {
    const now = new Date();
    const claimed = await this.prisma.auction.updateMany({
      where: {
        id: auctionId,
        status: AuctionStatus.LIVE,
        endingSoonNotifiedAt: null,
        endsAt: {
          gt: now,
          lte: new Date(now.getTime() + ENDING_SOON_WINDOW_MS),
        },
      },
      data: { endingSoonNotifiedAt: now },
    });
    if (claimed.count === 0) {
      return false; // otra pasada la reclamó, o ya no está en ventana.
    }
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: { endsAt: true },
    });
    if (auction) {
      this.gateway.broadcastEndingSoon(auctionId, auction.endsAt);
    }
    void this.mail.sendEndingSoon(auctionId);
    return true;
  }

  // Cierra una subasta vencida y fija su ganador (o la deja desierta). Transaccional
  // y con bloqueo de fila, por las mismas razones que una puja:
  //  - Relee `endsAt` BAJO el lock: una puja de última hora pudo extenderlo
  //    (antisniping, tarea 05); si ahora `endsAt > now`, no se cierra.
  //  - IDEMPOTENTE: solo actúa si sigue LIVE. Cerrar una subasta ya cerrada (cron
  //    solapado o proceso reiniciado) no reasigna ganador ni rompe.
  //  - Ganador DESNORMALIZADO: fija winnerUserId + winningBidId (tarea 01) para no
  //    recalcular la máxima en el cobro (09) ni en el impago (07).
  async closeAuction(auctionId: string): Promise<CloseResult> {
    const result = await this.prisma.$transaction(
      async (tx): Promise<CloseResult> => {
        const locked = await this.lockAuction(tx, auctionId);
        if (!locked) {
          return { outcome: 'not_found' };
        }
        // Idempotencia: solo se cierra lo que sigue en curso.
        if (locked.status !== AuctionStatus.LIVE) {
          return { outcome: 'noop' };
        }
        // El antisniping pudo mover el cierre al futuro entre que el cron la
        // seleccionó y este lock: entonces todavía no toca cerrarla.
        if (locked.endsAt.getTime() > Date.now()) {
          return { outcome: 'not_due' };
        }

        const highest = await this.highestBid(tx, auctionId);
        await tx.auction.update({
          where: { id: auctionId },
          data: {
            status: AuctionStatus.CLOSED,
            winnerUserId: highest?.userId ?? null,
            winningBidId: highest?.id ?? null,
            // Con ganador arranca su plazo de pago (tarea 07): si vence sin pagar,
            // el barrido lo banea y ofrece la subasta al siguiente. Desierta: null.
            paymentDueAt: highest
              ? new Date(Date.now() + PAYMENT_WINDOW_MS)
              : null,
          },
        });

        if (highest) {
          // Cobro (tarea 09): crea el pedido PENDING del ganador en ESTA misma
          // transacción, para que fijar-ganador y crear-pedido sean atómicos.
          await this.orders.createAuctionOrder(tx, {
            userId: highest.userId,
            auctionId,
            amountCents: highest.amountCents,
          });
        }

        return highest
          ? {
              outcome: 'closed_won',
              winnerUserId: highest.userId,
              winningBidId: highest.id,
              amountCents: highest.amountCents,
            }
          : { outcome: 'closed_empty' };
      },
    );

    // Emisión y ganchos, ya con el cierre confirmado en BD.
    if (result.outcome === 'closed_won') {
      this.gateway.broadcastClosed(auctionId, {
        winnerMasked: maskBidder(result.winnerUserId),
        amountCents: result.amountCents,
      });
      // Notifica "has ganado" al ganador (WS a su room personal + email de
      // respaldo con instrucciones de pago). secondChance=false: cierre normal.
      this.gateway.notifyWon(result.winnerUserId, {
        auctionId,
        amountCents: result.amountCents,
        secondChance: false,
      });
      void this.mail.sendWon(result.winnerUserId, result.amountCents, false);
    } else if (result.outcome === 'closed_empty') {
      // Subasta desierta: nadie pujó.
      this.gateway.broadcastClosed(auctionId, {
        winnerMasked: null,
        amountCents: null,
      });
    }

    return result;
  }

  // Subastas CLOSED cuyo ganador dejó vencer el plazo de pago sin pagar. Que sigan
  // CLOSED (y no PAID) es justo lo que significa "no pagó": el cobro (tarea 09) las
  // pasaría a PAID. Lo consulta el cron de impagos (AuctionsCloser).
  async findUnpaidWinners(): Promise<string[]> {
    const rows = await this.prisma.auction.findMany({
      where: {
        status: AuctionStatus.CLOSED,
        winnerUserId: { not: null },
        paymentDueAt: { lte: new Date() },
      },
      select: { id: true },
    });
    return rows.map((a) => a.id);
  }

  // Procesa el impago del ganador: lo banea y ofrece la subasta al siguiente
  // pujador (segunda oportunidad), o la deja desierta si no queda nadie. Igual que
  // el cierre, es transaccional, con bloqueo de fila e IDEMPOTENTE:
  //  - Relee estado/ganador/plazo BAJO el lock; si ya no está CLOSED, ya no hay
  //    ganador, o el plazo no ha vencido, no hace nada (dos pasadas del cron o un
  //    reinicio no rebanean ni reasignan dos veces).
  //  - El "siguiente pujador" es la puja más alta de un usuario NO baneado. Como el
  //    moroso queda baneado en esta misma transacción, su(s) puja(s) quedan
  //    excluidas automáticamente, igual que las de morosos anteriores en cadena: no
  //    hace falta llevar una lista de descartados.
  async handleUnpaidWinner(auctionId: string): Promise<UnpaidResult> {
    const now = new Date();
    const result = await this.prisma.$transaction(
      async (tx): Promise<UnpaidResult> => {
        // Lock de la fila con los campos del ciclo de vida (no los "biddables"):
        // estado, ganador y plazo. Mismo patrón FOR UPDATE que lockAuction.
        const rows = await tx.$queryRaw<
          {
            status: string;
            winnerUserId: string | null;
            paymentDueAt: Date | null;
          }[]
        >`
          SELECT status, "winnerUserId", "paymentDueAt"
          FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
        const locked = rows[0];
        if (!locked) {
          return { outcome: 'not_found' };
        }
        // Idempotencia: solo actúa sobre una subasta cerrada con ganador vivo.
        if (locked.status !== AuctionStatus.CLOSED || !locked.winnerUserId) {
          return { outcome: 'noop' };
        }
        // El plazo pudo reiniciarse (otra reasignación) o aún no haber vencido.
        if (
          !locked.paymentDueAt ||
          locked.paymentDueAt.getTime() > now.getTime()
        ) {
          return { outcome: 'not_due' };
        }

        const bannedUserId = locked.winnerUserId;
        // Ban del moroso. updateMany con `bannedAt: null` en el where lo hace
        // idempotente: si ya estaba baneado, no reescribe la fecha/motivo.
        await tx.user.updateMany({
          where: { id: bannedUserId, bannedAt: null },
          data: {
            bannedAt: now,
            banReason: `Impago de la subasta ${auctionId}`,
          },
        });

        // Siguiente pujador: la puja más alta de alguien NO baneado. Excluye al
        // moroso recién baneado (y a cualquier moroso anterior) sin lista manual.
        const next = await tx.bid.findFirst({
          where: { auctionId, user: { bannedAt: null } },
          orderBy: { amountCents: 'desc' },
        });

        if (next) {
          await tx.auction.update({
            where: { id: auctionId },
            data: {
              winnerUserId: next.userId,
              winningBidId: next.id,
              // Reinicia el plazo para el nuevo ganador. Sigue CLOSED (aún sin pago).
              paymentDueAt: new Date(now.getTime() + PAYMENT_WINDOW_MS),
            },
          });
          // Cobro (tarea 09): pedido del nuevo ganador. createAuctionOrder cancela
          // primero el pedido PENDING del moroso, así solo hay un pedido vivo.
          await this.orders.createAuctionOrder(tx, {
            userId: next.userId,
            auctionId,
            amountCents: next.amountCents,
          });
          return {
            outcome: 'reassigned',
            bannedUserId,
            winnerUserId: next.userId,
            winningBidId: next.id,
            amountCents: next.amountCents,
          };
        }

        // Sin más pujadores: la subasta queda desierta/cancelada.
        await tx.auction.update({
          where: { id: auctionId },
          data: {
            status: AuctionStatus.CANCELLED,
            winnerUserId: null,
            winningBidId: null,
            paymentDueAt: null,
          },
        });
        // Cobro (tarea 09): el moroso no pagó y no hay quien herede la subasta, así
        // que su pedido PENDING se cancela para no dejarlo huérfano.
        await tx.order.updateMany({
          where: { auctionId, status: OrderStatus.PENDING },
          data: { status: OrderStatus.CANCELLED },
        });
        return { outcome: 'cancelled_empty', bannedUserId };
      },
    );

    // Emisión y ganchos, ya con la reasignación confirmada en BD.
    if (result.outcome === 'reassigned') {
      this.gateway.broadcastClosed(auctionId, {
        winnerMasked: maskBidder(result.winnerUserId),
        amountCents: result.amountCents,
      });
      // Segunda oportunidad: "has ganado" al nuevo ganador (secondChance=true) y
      // "baneado por impago" al moroso. WS solo al ganador (el moroso seguramente
      // no está conectado); el email es el canal fiable para ambos.
      this.gateway.notifyWon(result.winnerUserId, {
        auctionId,
        amountCents: result.amountCents,
        secondChance: true,
      });
      void this.mail.sendWon(result.winnerUserId, result.amountCents, true);
      void this.mail.sendBannedForNonPayment(result.bannedUserId);
    } else if (result.outcome === 'cancelled_empty') {
      this.gateway.broadcastClosed(auctionId, {
        winnerMasked: null,
        amountCents: null,
      });
      // El moroso queda baneado aunque no haya siguiente pujador: se le avisa igual.
      void this.mail.sendBannedForNonPayment(result.bannedUserId);
    }

    return result;
  }

  // Registra una puja aplicando las reglas de negocio de la subasta. Esta es la
  // ÚNICA puerta de entrada de una puja: el gateway de tiempo real (tarea 03)
  // reutiliza este método en vez de duplicar la validación.
  //
  // Dos fases (control de concurrencia, tarea 04):
  //  1. FAST PATH sin lock: rechaza lo obvio (subasta cerrada, auto-superarse,
  //     puja por debajo de la máxima conocida) sin coger el lock, para no
  //     serializar pujas inválidas ni spam.
  //  2. FASE AUTORITATIVA en transacción: bloquea la fila de la subasta con
  //     SELECT ... FOR UPDATE, relee la máxima BAJO el lock y valida otra vez. Si
  //     la máxima avanzó desde el fast path (otra puja ganó la carrera), rechaza
  //     con OUTBID. Así dos pujas casi simultáneas sobre el mismo precio se
  //     serializan y solo una queda como máxima. Mismo mecanismo que la reserva
  //     de stock (Fase 3).
  async placeBid(auctionId: string, userId: string, dto: PlaceBidDto) {
    // Solo puja quien puede: email verificado y cuenta no baneada por impago
    // (tarea 07). Ambos flags se leen de BD en el momento de la acción sensible
    // (no viajan en el JWT), de una sola consulta.
    await this.assertCanBid(userId);

    // --- Fase 1: fast path sin lock ---
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction) {
      throw new NotFoundException('Subasta no encontrada');
    }
    this.assertOpen(auction);
    const seenHighest = await this.highestBid(this.prisma, auctionId);
    // Con la máxima que ve ahora, una puja por debajo es un error del propio
    // pujador → BID_TOO_LOW (no una carrera).
    this.assertBeats(
      auction,
      seenHighest,
      userId,
      dto.amountCents,
      BidRejectReason.BID_TOO_LOW,
    );

    // --- Fase 2: fase autoritativa bajo bloqueo de fila ---
    const { bid, endsAt, extended, previousLeaderId } =
      await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockAuction(tx, auctionId);
        if (!locked) {
          throw new NotFoundException('Subasta no encontrada');
        }
        this.assertOpen(locked); // pudo cerrarse entre el fast path y el lock.

        const highest = await this.highestBid(tx, auctionId);
        // Si aquí la puja ya no supera la máxima es porque OTRA puja se coló entre
        // el fast path y este lock: no es culpa del pujador, es una carrera perdida.
        this.assertBeats(
          locked,
          highest,
          userId,
          dto.amountCents,
          BidRejectReason.OUTBID,
        );

        // El líder ANTES de crear esta puja es el que queda superado (tarea 08).
        // Puede no haber (primera puja); nunca es el propio pujador (SELF_OUTBID lo
        // habría rechazado en assertBeats).
        const previousLeaderId = highest?.userId ?? null;

        const created = await tx.bid.create({
          data: { auctionId, userId, amountCents: dto.amountCents },
        });

        // Antisniping (tarea 05): si la puja llega en los últimos minutos, se
        // mueve el cierre a `now + ventana`. DENTRO de la misma transacción y del
        // mismo lock que la puja: así puja aceptada y cierre extendido son
        // atómicos; un proceso aparte podría perder la extensión por una carrera.
        const now = Date.now();
        let endsAt = locked.endsAt;
        let extended = false;
        if (endsAt.getTime() - now < ANTISNIPE_WINDOW_MS) {
          endsAt = new Date(now + ANTISNIPE_WINDOW_MS);
          extended = true;
          await tx.auction.update({
            where: { id: auctionId },
            data: {
              endsAt,
              // Se reinicia el guard de "a punto de cerrar" (tarea 08): el cierre se
              // ha movido, así que un aviso previo ya no vale y hay que poder
              // reavisar cuando la subasta se acerque de nuevo a su nuevo cierre.
              endingSoonNotifiedAt: null,
            },
          });
        }

        return { bid: created, endsAt, extended, previousLeaderId };
      });

    // Punto ÚNICO de emisión, ya con la puja confirmada en BD. Da igual si entró
    // por HTTP o por WS: todos los que miran reciben el nuevo precio (enmascarado).
    this.gateway.broadcastBidAccepted(auctionId, {
      amountCents: bid.amountCents,
      userMasked: maskBidder(userId),
      endsAt,
    });

    // Si el antisniping movió el cierre, se avisa a la room para que todos los
    // relojes del front actualicen la cuenta atrás (la verdad del endsAt está en
    // el servidor, no en el cliente).
    if (extended) {
      this.gateway.broadcastExtended(auctionId, endsAt);
    }

    // Superado (tarea 08): si esta puja destronó a un líder anterior, se le avisa
    // SOLO a él (WS a su room personal + email de respaldo). Una vez por pérdida de
    // liderato: no se notifica en cada puja intermedia.
    if (previousLeaderId) {
      this.gateway.notifyOutbid(previousLeaderId, {
        auctionId,
        amountCents: bid.amountCents,
      });
      void this.mail.sendOutbid(previousLeaderId, auctionId);
    }

    return bid;
  }

  // Bloquea la fila de la subasta con SELECT ... FOR UPDATE y devuelve los campos
  // que necesitan las validaciones. El lock serializa las pujas de ESTA subasta
  // (otras subastas no se ven afectadas) hasta el commit de la transacción.
  // `$queryRaw` parametriza el id (sin inyección); el nombre de tabla es un
  // literal nuestro, no entrada de usuario. Mismo patrón que OrdersService.lockItem.
  private async lockAuction(
    tx: Prisma.TransactionClient,
    auctionId: string,
  ): Promise<BiddableAuction | null> {
    const rows = await tx.$queryRaw<BiddableAuction[]>`
      SELECT status, "startsAt", "endsAt", "startingPriceCents", "minIncrementCents"
      FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
    return rows[0] ?? null;
  }

  // Puja máxima actual (la más alta). Si empatan importes gana la más antigua,
  // pero al exigir superar por el incremento no puede haber empate en el líder.
  private highestBid(
    client: PrismaService | Prisma.TransactionClient,
    auctionId: string,
  ) {
    return client.bid.findFirst({
      where: { auctionId },
      orderBy: { amountCents: 'desc' },
    });
  }

  // La subasta debe estar EN CURSO y dentro de su ventana temporal. Aún LIVE pero
  // pasado `endsAt` cuenta como cerrada para pujar.
  private assertOpen(auction: BiddableAuction): void {
    const now = Date.now();
    const isOpen =
      auction.status === AuctionStatus.LIVE &&
      auction.startsAt.getTime() <= now &&
      auction.endsAt.getTime() > now;
    if (!isOpen) {
      throw this.reject(
        BidRejectReason.AUCTION_CLOSED,
        'La subasta no está abierta a pujas',
      );
    }
  }

  // Valida que el importe supera a la máxima (o al precio de salida si no hay
  // pujas) y que el pujador no es ya el líder. `tooLowReason` distingue el mismo
  // fallo según la fase: BID_TOO_LOW en el fast path, OUTBID bajo el lock.
  private assertBeats(
    auction: BiddableAuction,
    highest: { userId: string; amountCents: number } | null,
    userId: string,
    amountCents: number,
    tooLowReason: string,
  ): void {
    if (highest && highest.userId === userId) {
      throw this.reject(
        BidRejectReason.SELF_OUTBID,
        'Ya eres el mejor postor de esta subasta',
      );
    }
    const minValidCents = highest
      ? highest.amountCents + auction.minIncrementCents
      : auction.startingPriceCents;
    if (amountCents < minValidCents) {
      throw this.reject(
        tooLowReason,
        `La puja debe ser de al menos ${minValidCents} céntimos`,
      );
    }
  }

  // 409 con motivo estable en `code` (además del mensaje humano en `message`).
  private reject(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }

  // Requisitos del pujador, leídos juntos de BD. Un baneado se rechaza con el
  // mismo mecanismo que los demás motivos de puja (409 con `code` BANNED) para que
  // HTTP y WS lo muestren igual; el email sin verificar es un 403 aparte (no es un
  // rechazo de puja, es una cuenta a medio configurar).
  private async assertCanBid(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true, bannedAt: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.bannedAt) {
      throw this.reject(
        BidRejectReason.BANNED,
        'Tu cuenta está baneada por impago y no puede pujar',
      );
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Verifica tu email antes de pujar');
    }
  }
}
