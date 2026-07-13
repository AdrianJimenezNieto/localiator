import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { AuctionStatus } from '@prisma/client';
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
  BANNED: 'BANNED', // usuario baneado por impago (tarea 07).
} as const;

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
  // reutilizará este método en vez de duplicar la validación.
  //
  // OJO: aquí todavía NO hay blindaje de concurrencia. Dos pujas casi simultáneas
  // pueden leer la misma máxima y ambas creerse ganadoras. Se cierra en la tarea
  // 04 envolviendo el "leer máxima → validar → insertar" en una transacción con
  // bloqueo de fila (ver TODO más abajo).
  async placeBid(auctionId: string, userId: string, dto: PlaceBidDto) {
    // Solo puja quien ha verificado su email (misma política que comprar; el flag
    // no viaja en el JWT, se lee de BD en el momento de la acción sensible).
    await this.assertEmailVerified(userId);

    // TODO(tarea 07): rechazar con BANNED si el usuario está baneado por impago.
    // El campo `User.bannedAt` se añade en la tarea 07; hasta entonces no hay a
    // quién banear, así que la comprobación se deja anotada aquí, en su sitio.

    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });
    if (!auction) {
      throw new NotFoundException('Subasta no encontrada');
    }

    // La subasta debe estar EN CURSO y dentro de su ventana temporal. `status`
    // (que mueve el cierre automático de la tarea 06) y las fechas se comprueban
    // juntos: aún LIVE pero pasado `endsAt` cuenta como cerrada para pujar.
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

    // Puja máxima actual (la más alta; si empatan importes, la más antigua es la
    // que manda, pero al exigir superar por el incremento no puede haber empate).
    const highest = await this.prisma.bid.findFirst({
      where: { auctionId },
      orderBy: { amountCents: 'desc' },
    });

    // No tiene sentido superarse a uno mismo: inflaría el precio sin competencia
    // real. Se rechaza (comportamiento habitual en subastas).
    if (highest && highest.userId === userId) {
      throw this.reject(
        BidRejectReason.SELF_OUTBID,
        'Ya eres el mejor postor de esta subasta',
      );
    }

    // Mínimo válido: sin pujas, el precio de salida; con pujas, la máxima más el
    // incremento mínimo (fijo por subasta en esta versión).
    const minValidCents = highest
      ? highest.amountCents + auction.minIncrementCents
      : auction.startingPriceCents;
    if (dto.amountCents < minValidCents) {
      throw this.reject(
        BidRejectReason.BID_TOO_LOW,
        `La puja debe ser de al menos ${minValidCents} céntimos`,
      );
    }

    // TODO(tarea 04): envolver este "leer máxima → validar → insertar" en una
    // transacción con bloqueo de fila de la subasta, para que dos pujas casi
    // simultáneas no ganen ambas sobre la misma máxima.
    const bid = await this.prisma.bid.create({
      data: { auctionId, userId, amountCents: dto.amountCents },
    });

    // Punto ÚNICO de emisión: da igual si la puja entró por HTTP o por WS, todos
    // los que miran esta subasta reciben el nuevo precio. Identidad enmascarada.
    this.gateway.broadcastBidAccepted(auctionId, {
      amountCents: bid.amountCents,
      userMasked: maskBidder(userId),
      endsAt: auction.endsAt,
    });

    return bid;
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
