import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { AuctionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionsGateway } from './auctions.gateway';
import { maskBidder } from './auctions.mask';
import { PlaceBidDto } from './dto/place-bid.dto';

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
  ) {}

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
    // Solo puja quien ha verificado su email (misma política que comprar; el flag
    // no viaja en el JWT, se lee de BD en el momento de la acción sensible).
    await this.assertEmailVerified(userId);

    // TODO(tarea 07): rechazar con BANNED si el usuario está baneado por impago.
    // El campo `User.bannedAt` se añade en la tarea 07; hasta entonces no hay a
    // quién banear, así que la comprobación se deja anotada aquí, en su sitio.

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
    const { bid, endsAt } = await this.prisma.$transaction(async (tx) => {
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

      const created = await tx.bid.create({
        data: { auctionId, userId, amountCents: dto.amountCents },
      });
      return { bid: created, endsAt: locked.endsAt };
    });

    // Punto ÚNICO de emisión, ya con la puja confirmada en BD. Da igual si entró
    // por HTTP o por WS: todos los que miran reciben el nuevo precio (enmascarado).
    this.gateway.broadcastBidAccepted(auctionId, {
      amountCents: bid.amountCents,
      userMasked: maskBidder(userId),
      endsAt,
    });

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

  private async assertEmailVerified(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Verifica tu email antes de pujar');
    }
  }
}
