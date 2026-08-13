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
  ProxyRejection,
  ProxyRules,
  ProxyState,
  resolveProxyBid,
} from './auctions.proxy';
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
  PUBLIC_AUCTION_STATUSES,
} from './dto/list-auctions.dto';
import {
  CalendarAuctionsDto,
  MAX_CALENDAR_RANGE_DAYS,
  MAX_CALENDAR_RANGE_MS,
} from './dto/calendar-auctions.dto';

// Motivos estables de rechazo de una puja. Se envían como `code` en el 409 para
// que el front dé feedback útil sin parsear el mensaje (que es solo humano).
export const BidRejectReason = {
  AUCTION_CLOSED: 'AUCTION_CLOSED', // no LIVE, o fuera de la ventana startsAt–endsAt.
  BID_TOO_LOW: 'BID_TOO_LOW', // no supera precio de salida / precio actual + incremento.
  // Ya lideras y el máximo que envías no supera al que ya tenías. Sustituye al
  // antiguo SELF_OUTBID: con puja proxy el líder SÍ puede volver a pujar, pero solo
  // para SUBIR su techo; bajarlo sería retractarse de una puja ya comprometida.
  MAX_NOT_INCREASED: 'MAX_NOT_INCREASED',
  OUTBID: 'OUTBID', // era válida al enviarla, pero otra puja te adelantó (carrera).
  BANNED: 'BANNED', // usuario baneado por impago (tarea 07).
} as const;

// Los campos de la subasta que necesitan las validaciones de puja. Sirve tanto
// para la fila leída con findUnique (fast path) como para la bloqueada con
// SELECT ... FOR UPDATE (fase autoritativa): ambas comparten esta forma.
//
// Incluye a la vez las REGLAS (precio de salida, incremento) y el ESTADO DEL PROXY
// (precio actual, líder y su techo), que es exactamente lo que necesita
// resolveProxyBid: por eso se le pasa esta misma fila como `state` y como `rules`.
interface BiddableAuction extends ProxyState, ProxyRules {
  status: string;
  startsAt: Date;
  endsAt: Date;
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
      // Fila Bid del líder a la que apunta el cierre. Nullable por defensa: el
      // ganador sale del estado del proxy (`leaderUserId`) y siempre debería tener
      // al menos una fila, pero no se hace depender el cierre de esa invariante.
      winningBidId: string | null;
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
      // Precio efectivo del estado del proxy; el de salida mientras no haya pujas.
      currentPriceCents: row.currentPriceCents ?? row.startingPriceCents,
      bidCount: row._count.bids,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      winner: row.winner,
      paymentDueAt: row.paymentDueAt,
    }));
  }

  // Detalle de una subasta para el formulario de edición del backoffice: misma
  // forma que una fila de listAuctionsForAdmin (incluido bidCount, que el
  // formulario necesita para deshabilitar los campos que updateAuction ya no
  // deja tocar una vez hay pujas).
  async getAuctionForAdmin(auctionId: string) {
    const row = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        _count: { select: { bids: true } },
        winner: { select: { id: true, email: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Subasta no encontrada');
    }
    const items = await this.resolveItems([row]);
    return {
      id: row.id,
      itemType: row.itemType,
      itemId: row.itemId,
      itemName: items.get(this.itemKey(row))?.name ?? null,
      status: row.status,
      startingPriceCents: row.startingPriceCents,
      minIncrementCents: row.minIncrementCents,
      // Precio efectivo del estado del proxy; el de salida mientras no haya pujas.
      currentPriceCents: row.currentPriceCents ?? row.startingPriceCents,
      bidCount: row._count.bids,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      winner: row.winner,
      paymentDueAt: row.paymentDueAt,
    };
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

    const hasBids = (await this.prisma.bid.count({ where: { auctionId } })) > 0;
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

  // Avisa de que una subasta se canceló porque una venta directa agotó su artículo
  // (tarea 15). La cancelación en BD ya la hizo OrdersService dentro de la
  // transacción del cobro (no puede llamarnos: AuctionsModule ya importa
  // OrdersModule y sería un ciclo); esto es solo el aviso.
  //
  // Los pujadores llevan días pujando y se quedan sin nada, así que además del WS
  // (que solo ve quien esté mirando la ficha) va un email, que es el canal fiable.
  async notifyAuctionCancelled(auctionId: string): Promise<void> {
    // Se reutiliza `auction:closed` sin ganador en vez de un evento nuevo: el front
    // ya lo pinta como "cerrada sin ganador", que es exactamente lo que ha pasado.
    this.gateway.broadcastClosed(auctionId, {
      winnerMasked: null,
      amountCents: null,
    });
    await this.mail.sendAuctionCancelled(auctionId);
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
          _count: { select: { bids: true } },
        },
      }),
      this.prisma.auction.count({ where }),
    ]);

    const items = await this.resolveItems(rows);
    return {
      items: rows.map((row) => this.toListItem(row, items)),
      total,
      page,
      pageSize,
    };
  }

  // Subastas cuyo CIERRE cae en el rango [from, to), sin paginar, para el
  // calendario público. Devuelve la misma forma que el listado (AuctionListItem)
  // a propósito: así el front reutiliza la misma tarjeta en el panel del día.
  //
  // Sin paginación porque la rejilla necesita el mes ENTERO: una página de 24
  // dejaría días sin marcar aunque tuvieran subastas, y sería un fallo invisible
  // (no da error, simplemente miente). El coste lo acota MAX_CALENDAR_RANGE_DAYS.
  //
  // Aquí las CLOSED SÍ entran por defecto, al revés que en listPublicAuctions: en
  // un calendario se navega a meses pasados, y un mes vacío parecería roto.
  async listAuctionsForCalendar(
    dto: CalendarAuctionsDto,
  ): Promise<AuctionListItem[]> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    // Coherencia del rango: en el servicio y no en el DTO porque class-validator
    // valida campo a campo, y una regla que cruza dos campos necesita un validador
    // propio (registerDecorator) que para un solo caso complica más que aporta.
    if (to.getTime() <= from.getTime()) {
      throw this.badRequest(
        'INVALID_RANGE',
        'La fecha de fin debe ser posterior a la de inicio',
      );
    }
    if (to.getTime() - from.getTime() > MAX_CALENDAR_RANGE_MS) {
      throw this.badRequest(
        'INVALID_RANGE',
        `El rango no puede superar los ${MAX_CALENDAR_RANGE_DAYS} días`,
      );
    }

    const rows = await this.prisma.auction.findMany({
      // Rango SEMIABIERTO [from, to): el instante `to` pertenece al mes siguiente.
      // Si fuera cerrado por ambos lados, dos meses contiguos se solaparían un
      // instante y una subasta que cierra justo en la frontera saldría dos veces.
      where: {
        status: { in: [...PUBLIC_AUCTION_STATUSES] },
        endsAt: { gte: from, lt: to },
      },
      orderBy: { endsAt: 'asc' },
      include: {
        _count: { select: { bids: true } },
      },
    });

    const items = await this.resolveItems(rows);
    return rows.map((row) => this.toListItem(row, items));
  }

  // Fila de Auction (con su puja máxima y su conteo) → tarjeta pública. Lo usan
  // el listado paginado y el calendario; vive aquí para que ambos no puedan
  // divergir en lo que exponen (que es justo donde se filtran datos de más).
  private toListItem(
    // Ya no hace falta traerse la puja más alta: el precio actual vive en la propia
    // fila de Auction (estado del proxy), lo que ahorra un join por listado.
    row: Prisma.AuctionGetPayload<{
      include: { _count: { select: { bids: true } } };
    }>,
    items: Map<string, { name: string; photo: string | null }>,
  ): AuctionListItem {
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
      // Precio efectivo del estado del proxy; el de salida mientras no haya pujas.
      currentPriceCents: row.currentPriceCents ?? row.startingPriceCents,
      startingPriceCents: row.startingPriceCents,
      minIncrementCents: row.minIncrementCents,
      bidCount: row._count.bids,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    };
  }

  // Estado inicial que se envía a un socket al unirse a la subasta (evento
  // `auction:state`), para que el front pinte sin un GET REST aparte. Solo datos
  // públicos + identidad enmascarada de los postores (RGPD).
  //
  // `viewerUserId` es la identidad autenticada del socket que pregunta (undefined
  // si es un invitado). Sirve solo para devolverle SU PROPIO máximo: es el único
  // dato privado que sale de aquí, y solo a su dueño.
  async getAuctionState(auctionId: string, viewerUserId?: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      // `id: desc` como desempate: las filas automáticas del proxy se crean en la
      // misma transacción que la puja humana, así que pueden compartir `createdAt`
      // al milisegundo y el historial saldría en orden arbitrario. El cuid es
      // creciente en el tiempo, así que rompe el empate en el orden correcto.
      include: {
        bids: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 },
      },
    });
    if (!auction) {
      throw new NotFoundException('Subasta no encontrada');
    }
    // Resultado del cierre, con la MISMA forma que el evento `auction:closed`
    // (tarea 06). Quien entra a la ficha DESPUÉS del cierre no vio pasar ese
    // evento, así que sin esto el front no tendría forma de saber que la subasta
    // ya no admite pujas. `null` mientras siga viva.
    const closed =
      auction.status === AuctionStatus.SCHEDULED ||
      auction.status === AuctionStatus.LIVE
        ? null
        : {
            // Ganador enmascarado (RGPD), igual que los postores.
            winnerMasked: auction.winnerUserId
              ? maskBidder(auction.winnerUserId)
              : null,
            amountCents: auction.winningBidId
              ? ((
                  await this.prisma.bid.findUnique({
                    where: { id: auction.winningBidId },
                    select: { amountCents: true },
                  })
                )?.amountCents ?? null)
              : null,
          };

    // El máximo PROPIO del que mira, y solo el suyo. Se busca su puja humana de
    // mayor techo: es lo que tiene autorizado ahora mismo. Un invitado no recibe
    // nada. Nunca se devuelve el máximo de otro (ni el del líder): quien lo
    // conociera ganaría la subasta por un céntimo.
    const myMaxCents = viewerUserId
      ? ((
          await this.prisma.bid.findFirst({
            where: { auctionId, userId: viewerUserId, isAutomatic: false },
            orderBy: { maxAmountCents: 'desc' },
            select: { maxAmountCents: true },
          })
        )?.maxAmountCents ?? null)
      : null;

    return {
      id: auction.id,
      status: auction.status,
      startingPriceCents: auction.startingPriceCents,
      minIncrementCents: auction.minIncrementCents,
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      // Precio efectivo actual (estado del proxy), no "la puja más alta".
      highestBidCents: auction.currentPriceCents,
      // Si el que mira va ganando ahora mismo. Le permite al front distinguir
      // "te han superado" de "sigues en cabeza" sin revelar quién es el líder.
      isLeading: viewerUserId != null && auction.leaderUserId === viewerUserId,
      myMaxCents,
      closed,
      bids: auction.bids.map((b) => ({
        amountCents: b.amountCents,
        userMasked: maskBidder(b.userId),
        // Marca la puja generada por el proxy, para que en la ficha se entienda
        // por qué el precio sube sin que nadie haya tocado nada.
        isAutomatic: b.isAutomatic,
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

        // Con puja proxy el ganador es el LÍDER del estado desnormalizado y paga el
        // precio efectivo actual, no "la puja más alta": su techo pudo quedar muy
        // por encima de lo que realmente llegó a pagar.
        const highest =
          locked.leaderUserId != null && locked.currentPriceCents != null
            ? {
                userId: locked.leaderUserId,
                amountCents: locked.currentPriceCents,
                // Fila real a la que apuntar `winningBidId` (es @unique y hay
                // integridad referencial que respetar).
                id: (await this.latestBidOf(tx, auctionId, locked.leaderUserId))
                  ?.id,
              }
            : null;
        // Un ÚNICO instante para el plazo de pago: lo comparten la subasta y la
        // reserva de stock del ganador (tarea 15). Calcularlo dos veces daría dos
        // fechas con milisegundos distintos y dos relojes que pueden divergir.
        const paymentDueAt = highest
          ? new Date(Date.now() + PAYMENT_WINDOW_MS)
          : null;
        await tx.auction.update({
          where: { id: auctionId },
          data: {
            status: AuctionStatus.CLOSED,
            winnerUserId: highest?.userId ?? null,
            winningBidId: highest?.id ?? null,
            // Con ganador arranca su plazo de pago (tarea 07): si vence sin pagar,
            // el barrido lo banea y ofrece la subasta al siguiente. Desierta: null.
            paymentDueAt,
          },
        });

        if (highest && paymentDueAt) {
          // Cobro (tarea 09): crea el pedido PENDING del ganador en ESTA misma
          // transacción, para que fijar-ganador y crear-pedido sean atómicos. El
          // pedido reserva el artículo hasta `paymentDueAt` (tarea 15), para que la
          // venta directa no pueda llevárselo mientras el ganador paga.
          await this.orders.createAuctionOrder(tx, {
            userId: highest.userId,
            auctionId,
            amountCents: highest.amountCents,
            paymentDueAt,
          });
        }

        return highest
          ? {
              outcome: 'closed_won',
              winnerUserId: highest.userId,
              winningBidId: highest.id ?? null,
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
  //  - El "siguiente pujador" es quien tenía el MÁXIMO más alto entre los usuarios
  //    NO baneados (ver la consulta más abajo: con proxy ya no vale ordenar por
  //    importe). Como el moroso queda baneado en esta misma transacción, sus pujas
  //    quedan excluidas automáticamente, igual que las de morosos anteriores en
  //    cadena: no hace falta llevar una lista de descartados.
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
            currentPriceCents: number | null;
          }[]
        >`
          SELECT status, "winnerUserId", "paymentDueAt", "currentPriceCents"
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

        // Siguiente pujador. Con puja proxy NO es "la puja de importe más alto":
        // es quien tenía el MÁXIMO más alto entre los que siguen vivos. Un usuario
        // pudo quedar segundo con un importe visible bajo pero un techo altísimo, y
        // es él quien de verdad va detrás en la fila.
        //
        // El desempate por `createdAt` asc mantiene la misma regla que el resto del
        // sistema: a igualdad de máximo gana quien lo puso primero. Se excluyen las
        // filas automáticas: son ecos del proxy, no compromisos nuevos, y su techo
        // ya está representado por la puja humana del mismo usuario.
        const next = await tx.bid.findFirst({
          where: {
            auctionId,
            isAutomatic: false,
            user: { bannedAt: null },
          },
          orderBy: [{ maxAmountCents: 'desc' }, { createdAt: 'asc' }],
        });

        if (next) {
          // Precio del nuevo ganador: su propio máximo, pero nunca por encima de lo
          // que la subasta llegó a alcanzar. Las dos cotas importan: no se le puede
          // cobrar más de lo que autorizó (su techo), ni más de lo que el artículo
          // llegó a valer en la puja (el precio que debía el moroso).
          const nextPriceCents = Math.min(
            next.maxAmountCents,
            locked.currentPriceCents ?? next.maxAmountCents,
          );
          // Mismo instante para el plazo de la subasta y para la reserva del nuevo
          // ganador (tarea 15): dos relojes separados podrían divergir.
          const paymentDueAt = new Date(now.getTime() + PAYMENT_WINDOW_MS);
          await tx.auction.update({
            where: { id: auctionId },
            data: {
              winnerUserId: next.userId,
              winningBidId: next.id,
              // Reinicia el plazo para el nuevo ganador. Sigue CLOSED (aún sin pago).
              paymentDueAt,
              // El estado del proxy pasa también al nuevo ganador: si no, la subasta
              // seguiría diciendo que lidera el moroso ya baneado.
              currentPriceCents: nextPriceCents,
              leaderUserId: next.userId,
              leaderMaxCents: next.maxAmountCents,
            },
          });
          // Cobro (tarea 09): pedido del nuevo ganador. createAuctionOrder cancela
          // primero el pedido PENDING del moroso —y BORRA su reserva, que si no
          // seguiría bloqueando el stock 48 h (tarea 15)—, así solo hay un pedido y
          // una reserva vivos.
          await this.orders.createAuctionOrder(tx, {
            userId: next.userId,
            auctionId,
            amountCents: nextPriceCents,
            paymentDueAt,
          });
          return {
            outcome: 'reassigned',
            bannedUserId,
            winnerUserId: next.userId,
            winningBidId: next.id,
            amountCents: nextPriceCents,
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
            // Se limpia también el estado del proxy: dejar apuntando al moroso
            // baneado como "líder" de una subasta cancelada sería basura que
            // reaparecería en la ficha y en el listado.
            currentPriceCents: null,
            leaderUserId: null,
            leaderMaxCents: null,
          },
        });
        // Cobro (tarea 09): el moroso no pagó y no hay quien herede la subasta, así
        // que su pedido PENDING se cancela para no dejarlo huérfano. Se BORRA además
        // su reserva de stock (tarea 15): sin esto el artículo seguiría bloqueado
        // hasta que venciera la reserva, aunque ya no haya subasta ni ganador que lo
        // espere. Al liberarla vuelve al catálogo, que es lo correcto: la subasta
        // quedó desierta.
        const orphan = await tx.order.findMany({
          where: { auctionId, status: OrderStatus.PENDING },
          select: { id: true },
        });
        if (orphan.length > 0) {
          const ids = orphan.map((o) => o.id);
          await tx.stockReservation.deleteMany({
            where: { orderId: { in: ids } },
          });
          await tx.order.updateMany({
            where: { id: { in: ids } },
            data: { status: OrderStatus.CANCELLED },
          });
        }
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

  // Registra una puja PROXY aplicando las reglas de negocio de la subasta. Esta es
  // la ÚNICA puerta de entrada de una puja: el gateway de tiempo real (tarea 03)
  // reutiliza este método en vez de duplicar la validación.
  //
  // OJO al cambio de significado: `dto.maxAmountCents` NO es lo que se puja, es el
  // MÁXIMO que el usuario autoriza. Cuánto se puja de verdad lo decide
  // resolveProxyBid (ver auctions.proxy.ts), que es donde vive toda la regla.
  //
  // Dos fases (control de concurrencia, tarea 04):
  //  1. FAST PATH sin lock: rechaza lo obvio (subasta cerrada, máximo por debajo
  //     del mínimo exigible) sin coger el lock, para no serializar pujas inválidas
  //     ni spam.
  //  2. FASE AUTORITATIVA en transacción: bloquea la fila de la subasta con
  //     SELECT ... FOR UPDATE, RESUELVE EL PROXY BAJO EL LOCK y escribe el nuevo
  //     estado. Si el precio avanzó desde el fast path (otra puja ganó la carrera)
  //     y el máximo ya no da, rechaza con OUTBID. Así dos pujas casi simultáneas se
  //     serializan y solo queda un líder coherente. Mismo mecanismo que la reserva
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
    // Se resuelve "en seco" con el estado sin bloquear, solo para descartar lo que
    // ya es inválido de partida. Un rechazo aquí es un error del propio pujador
    // (BID_TOO_LOW), no una carrera perdida.
    const preview = resolveProxyBid(
      auction,
      auction,
      userId,
      dto.maxAmountCents,
    );
    if (preview.kind === 'rejected') {
      throw this.rejectProxy(preview, BidRejectReason.BID_TOO_LOW);
    }

    // --- Fase 2: fase autoritativa bajo bloqueo de fila ---
    const {
      bid,
      endsAt,
      extended,
      priceChanged,
      currentPriceCents,
      outbidId,
      leaderUserId,
      priceIsAutomatic,
    } = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockAuction(tx, auctionId);
      if (!locked) {
        throw new NotFoundException('Subasta no encontrada');
      }
      this.assertOpen(locked); // pudo cerrarse entre el fast path y el lock.

      // La fila bloqueada lleva a la vez las reglas y el estado del proxy, por
      // eso va como `state` y como `rules` (ver BiddableAuction).
      const resolution = resolveProxyBid(
        locked,
        locked,
        userId,
        dto.maxAmountCents,
      );
      // Si aquí ya no vale es porque OTRA puja se coló entre el fast path y este
      // lock: no es culpa del pujador, es una carrera perdida.
      if (resolution.kind === 'rejected') {
        throw this.rejectProxy(resolution, BidRejectReason.OUTBID);
      }

      // Caso "solo subo mi propio techo": no cambia ni el precio ni el líder, así
      // que nadie más se entera. Se registra igualmente la fila Bid porque la
      // segunda oportunidad por impago necesita conocer los máximos de cada uno.
      if (resolution.kind === 'raised-own-max') {
        await tx.auction.update({
          where: { id: auctionId },
          data: { leaderMaxCents: resolution.leaderMaxCents },
        });
        const created = await tx.bid.create({
          data: {
            auctionId,
            userId,
            amountCents: locked.currentPriceCents ?? 0,
            maxAmountCents: resolution.leaderMaxCents,
          },
        });
        // NO se aplica antisniping: el precio no se ha movido, así que no hay
        // nada a lo que los demás deban tener tiempo de reaccionar. Extender aquí
        // dejaría además que el líder alargase la subasta él solo, a base de
        // subirse el techo un céntimo cada vez.
        return {
          bid: created,
          endsAt: locked.endsAt,
          extended: false,
          priceChanged: false,
          currentPriceCents: locked.currentPriceCents ?? 0,
          outbidId: null as string | null,
          leaderUserId: userId, // sigue liderando él; no cambia nada.
          priceIsAutomatic: false, // no se emite nada; el valor es irrelevante.
        };
      }

      // Casos 'lead' y 'held': el precio se mueve y hay que reescribir el estado
      // del proxy. Es la ÚNICA escritura de estas tres columnas en todo el
      // proyecto, y ocurre siempre bajo este lock.
      await tx.auction.update({
        where: { id: auctionId },
        data: {
          currentPriceCents: resolution.currentPriceCents,
          leaderUserId: resolution.leaderUserId,
          leaderMaxCents: resolution.leaderMaxCents,
        },
      });

      // Filas del historial. Se escriben en orden cronológico para que la ficha
      // cuente bien lo ocurrido: primero la defensa automática del proxy que
      // estaba en cabeza, después la puja que provocó todo.
      if (resolution.kind === 'lead' && resolution.defendedPriceCents != null) {
        // El líder anterior cayó, pero su proxy llegó a agotar su techo
        // defendiéndose. Sin esta fila, el salto de precio parecería magia.
        await tx.bid.create({
          data: {
            auctionId,
            userId: locked.leaderUserId!,
            amountCents: resolution.defendedPriceCents,
            maxAmountCents: resolution.defendedPriceCents,
            isAutomatic: true,
          },
        });
      }

      const created = await tx.bid.create({
        data: {
          auctionId,
          userId,
          // En 'lead' el pujador se queda con el precio nuevo. En 'held' su puja
          // muere en su propio techo: es hasta donde llegó a comprometerse.
          amountCents:
            resolution.kind === 'lead'
              ? resolution.currentPriceCents
              : dto.maxAmountCents,
          maxAmountCents: dto.maxAmountCents,
        },
      });

      if (resolution.kind === 'held') {
        // El líder aguantó: su proxy sube automáticamente hasta tapar al retador.
        await tx.bid.create({
          data: {
            auctionId,
            userId: resolution.leaderUserId,
            amountCents: resolution.currentPriceCents,
            maxAmountCents: resolution.leaderMaxCents,
            isAutomatic: true,
          },
        });
      }

      // Antisniping (tarea 05): si la puja llega en los últimos minutos, se
      // mueve el cierre a `now + ventana`. DENTRO de la misma transacción y del
      // mismo lock que la puja: así puja aceptada y cierre extendido son
      // atómicos; un proceso aparte podría perder la extensión por una carrera.
      //
      // Lo dispara la acción HUMANA que acaba de llegar, no las filas automáticas
      // que ha generado el proxy: si contáramos también esas, una guerra de
      // proxies extendería el cierre dos veces por cada puja recibida.
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

      return {
        bid: created,
        endsAt,
        extended,
        priceChanged: true,
        currentPriceCents: resolution.currentPriceCents,
        // A quién hay que avisar de que su MÁXIMO ha sido superado. En 'lead' es
        // el líder destronado; en 'held', el propio retador, que nace superado.
        outbidId: resolution.outbidUserId,
        // El líder que se anuncia a la sala es el que queda tras resolver, no
        // necesariamente quien acaba de pujar.
        leaderUserId: resolution.leaderUserId,
        // En 'held' el precio que se anuncia lo puso el PROXY del líder, no una
        // persona: la sala debe verlo marcado como automático. En 'lead' es la
        // puja humana del retador.
        priceIsAutomatic: resolution.kind === 'held',
      };
    });

    // Punto ÚNICO de emisión, ya con la puja confirmada en BD. Da igual si entró
    // por HTTP o por WS: todos los que miran reciben el nuevo precio (enmascarado).
    //
    // Si solo se subió el techo propio NO se emite nada: el precio no ha cambiado y
    // el máximo es privado, así que la sala no debe percibir movimiento alguno.
    if (priceChanged) {
      this.gateway.broadcastBidAccepted(auctionId, {
        amountCents: currentPriceCents,
        userMasked: maskBidder(leaderUserId),
        endsAt,
        isAutomatic: priceIsAutomatic,
      });
    }

    // Si el antisniping movió el cierre, se avisa a la room para que todos los
    // relojes del front actualicen la cuenta atrás (la verdad del endsAt está en
    // el servidor, no en el cliente).
    if (extended) {
      this.gateway.broadcastExtended(auctionId, endsAt);
    }

    // Superado (tarea 08): se avisa SOLO al usuario cuyo MÁXIMO ha sido superado
    // (WS a su room personal + email de respaldo por Resend). Con puja proxy esto
    // es mucho menos frecuente que antes, y a propósito: mientras tu techo aguante,
    // el sistema sube por ti en silencio y no te molesta. Solo se avisa cuando de
    // verdad te has quedado fuera y tienes que decidir si subes.
    //
    // Puede ser el líder destronado ('lead') o el propio pujador que acaba de nacer
    // superado porque su techo no llegaba al del líder ('held').
    if (outbidId) {
      this.gateway.notifyOutbid(outbidId, {
        auctionId,
        amountCents: currentPriceCents,
      });
      void this.mail.sendOutbid(outbidId, auctionId);
    }

    // Se devuelve la puja MÁS si el pujador ha quedado en cabeza. Este dato solo
    // llega a su dueño (respuesta HTTP o evento `bid:accepted:self`), nunca a la
    // room: saber quién lidera con qué techo es justo lo que no debe salir.
    return { ...bid, isLeading: leaderUserId === userId };
  }

  // Traduce el rechazo de resolveProxyBid al 409 con código estable del canal.
  // `raceReason` es el código a usar cuando el motivo es "no llegas al mínimo":
  // BID_TOO_LOW en el fast path (error del pujador) y OUTBID bajo el lock (carrera
  // perdida). El caso "no has subido tu techo" no depende de la fase.
  private rejectProxy(
    rejection: { reason: string; minValidCents: number },
    raceReason: string,
  ): ConflictException {
    if (rejection.reason === ProxyRejection.MAX_NOT_INCREASED) {
      return this.reject(
        BidRejectReason.MAX_NOT_INCREASED,
        'Ya vas ganando: para reforzar tu puja indica un máximo mayor que el actual',
      );
    }
    return this.reject(
      raceReason,
      `Tu máximo debe ser de al menos ${rejection.minValidCents} céntimos`,
    );
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
      SELECT status, "startsAt", "endsAt", "startingPriceCents", "minIncrementCents",
             "currentPriceCents", "leaderUserId", "leaderMaxCents"
      FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
    return rows[0] ?? null;
  }

  // Última puja registrada del líder actual. Con puja proxy, quién va ganando sale
  // del estado desnormalizado de la subasta (`leaderUserId`), no de ordenar las
  // filas Bid; esto solo sirve para apuntar `winningBidId` a una fila real al
  // cerrar. Se toma la más reciente porque es la que refleja el precio final.
  private latestBidOf(
    client: PrismaService | Prisma.TransactionClient,
    auctionId: string,
    userId: string,
  ) {
    return client.bid.findFirst({
      where: { auctionId, userId },
      orderBy: { createdAt: 'desc' },
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
