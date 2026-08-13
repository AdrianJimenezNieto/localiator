import { ConflictException, Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { AccessTokenPayload } from '../auth/session.service';
import { AuctionsService } from './auctions.service';

// Identidad autenticada del socket (o undefined si es un invitado que solo mira).
interface SocketUser {
  userId: string;
  role: string;
}

// `Socket.data` es `any` por defecto en Socket.IO. Lo tipamos con la identidad del
// socket para que leer `client.data.user` sea seguro (sin `any` suelto).
type AuctionSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { user?: SocketUser }
>;

// Rate limit propio del canal WS: una puja como mucho cada MIN_BID_INTERVAL_MS por
// USUARIO. El ThrottlerGuard global es para HTTP y no ve los mensajes de Socket.IO,
// así que el flood de pujas se frena aquí (punto sensible, CLAUDE.md).
//
// Por usuario y no por socket a propósito: con la clave puesta en `client.id`
// bastaba abrir dos pestañas (dos sockets, misma persona) para duplicar el ritmo
// permitido, y el límite dejaba de significar nada.
const MIN_BID_INTERVAL_MS = 1000;

// El mapa del rate limit se poda de forma perezosa: cada RATE_LIMIT_SWEEP_MS, la
// siguiente puja que llegue tira las entradas ya caducadas. Sin esto el mapa crece
// para siempre (una entrada por usuario que haya pujado alguna vez) en un proceso
// que corre semanas. Se hace aprovechando el tráfico en vez de con un `setInterval`
// porque un timer mantendría el proceso ocupado y habría que pararlo en los tests.
const RATE_LIMIT_SWEEP_MS = 60_000;

// Origen permitido para el WebSocket: el mismo que el CORS HTTP de main.ts. Se lee
// de process.env directamente (no de ConfigService) porque el decorador se evalúa
// al IMPORTAR la clase, antes de que el ConfigModule cargue el .env. En producción
// APP_URL es una variable de entorno real (docker-compose), disponible ya en ese
// momento; en desarrollo cae al default correcto.
const CORS_ORIGIN =
  process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'http://localhost:5173';

@WebSocketGateway({
  namespace: '/auctions',
  cors: { origin: CORS_ORIGIN, credentials: true },
})
export class AuctionsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AuctionsGateway.name);
  // userId -> instante de su última puja aceptada por el rate limit.
  private readonly lastBidAt = new Map<string, number>();
  private lastSweepAt = 0;

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwt: JwtService,
    // forwardRef: ciclo con AuctionsService (ver comentario en el servicio).
    @Inject(forwardRef(() => AuctionsService))
    private readonly auctions: AuctionsService,
  ) {}

  // Autenticación del handshake: distinta del guard HTTP. Los guards de Nest no
  // ven el handshake de Socket.IO, así que verificamos el token a mano. Si el
  // token es válido, el socket queda autenticado (puede pujar); si no hay token o
  // es inválido, se DEJA conectar igual (el invitado mira pero no puja).
  handleConnection(client: AuctionSocket): void {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) return;
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token);
      client.data.user = { userId: payload.sub, role: payload.role };
      // Room personal del usuario (tarea 08): además de la room de la subasta,
      // cada socket autenticado entra a `user:<id>`. Así los eventos personales
      // (superado, ganado) se dirigen a TODAS sus pestañas sin mandárselos a la
      // room de la subasta (no filtramos identidades a terceros; RGPD).
      void client.join(this.userRoom(payload.sub));
    } catch {
      // Token caducado/inválido: se ignora, el socket queda como invitado.
    }
  }

  // El cliente entra a la room de una subasta al abrir su ficha. Le devolvemos el
  // estado actual solo a él (no a toda la room) para que pinte sin un GET REST.
  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: AuctionSocket,
    @MessageBody() body: { auctionId: string },
  ) {
    const auctionId = body?.auctionId;
    if (!auctionId) return;
    await client.join(this.room(auctionId));
    try {
      // Se le pasa SU identidad para que el estado incluya su propio máximo (y solo
      // el suyo). Un invitado no manda nada y no recibe ningún dato privado.
      const state = await this.auctions.getAuctionState(
        auctionId,
        client.data.user?.userId,
      );
      client.emit('auction:state', state);
    } catch {
      client.emit('bid:rejected', {
        code: 'NOT_FOUND',
        message: 'Subasta no encontrada',
      });
    }
  }

  // Pujar por WS: exige socket autenticado y respeta el rate limit por socket.
  // Delega en la MISMA regla de negocio que el endpoint HTTP (no se duplica). El
  // broadcast a la room lo hace el servicio (punto único de emisión).
  @SubscribeMessage('bid')
  async onBid(
    @ConnectedSocket() client: AuctionSocket,
    // `maxAmountCents`: el techo del pujador, no el importe a pujar (puja proxy).
    @MessageBody() body: { auctionId: string; maxAmountCents: number },
  ) {
    const user = client.data.user;
    if (!user) {
      client.emit('bid:rejected', {
        code: 'UNAUTHENTICATED',
        message: 'Inicia sesión para pujar',
      });
      return;
    }

    const now = Date.now();
    const last = this.lastBidAt.get(user.userId) ?? 0;
    if (now - last < MIN_BID_INTERVAL_MS) {
      client.emit('bid:rejected', {
        code: 'RATE_LIMITED',
        message: 'Vas demasiado rápido, espera un momento',
      });
      return;
    }
    this.lastBidAt.set(user.userId, now);
    this.sweepRateLimit(now);

    try {
      const bid = await this.auctions.placeBid(body.auctionId, user.userId, {
        maxAmountCents: body.maxAmountCents,
      });
      // Confirmación al EMISOR, y solo a él: lleva su propio máximo registrado y si
      // ha quedado en cabeza. Son datos privados, por eso van por `client.emit`
      // (socket concreto) y no por la room.
      client.emit('bid:accepted:self', {
        myMaxCents: bid.maxAmountCents,
        isLeading: bid.isLeading,
      });
    } catch (error) {
      client.emit('bid:rejected', this.toRejection(error));
    }
  }

  // Difunde a toda la room de la subasta que hay un precio nuevo. Lo llama
  // AuctionsService.placeBid tras registrar la puja (único punto de emisión).
  //
  // `isAutomatic` distingue la puja humana de la subida que el proxy hizo solo en
  // nombre del líder. Sin ese dato, quien mira la ficha en vivo ve el precio subir
  // sin que nadie haya pujado y parece un fallo; al recargar sí lo veía, porque el
  // historial de `auction:state` sí lo traía. Es el mismo campo, ahora también en
  // vivo. Nunca lleva importes privados: solo el precio efectivo, que es público.
  broadcastBidAccepted(
    auctionId: string,
    payload: {
      amountCents: number;
      userMasked: string;
      endsAt: Date;
      isAutomatic: boolean;
    },
  ): void {
    this.server.to(this.room(auctionId)).emit('bid:accepted', payload);
  }

  // Avisa a la room de que la subasta acaba de abrirse (tarea 10). Quien estuviera
  // esperando en la ficha de una subasta programada la ve pasar a "en directo" sin
  // recargar. Lo llama AuctionsService.openAuction.
  broadcastOpened(auctionId: string, endsAt: Date): void {
    this.server.to(this.room(auctionId)).emit('auction:opened', { endsAt });
  }

  // Avisa a la room de que el antisniping (tarea 05) movió el cierre. Lo llama
  // AuctionsService.placeBid tras extender `endsAt` dentro de la transacción, para
  // que todos los relojes del front actualicen la cuenta atrás.
  broadcastExtended(auctionId: string, endsAt: Date): void {
    this.server.to(this.room(auctionId)).emit('auction:extended', { endsAt });
  }

  // Avisa a la room de que la subasta se cerró (tarea 06). El ganador va
  // enmascarado (o null si quedó desierta). Lo llama AuctionsService.closeAuction.
  broadcastClosed(
    auctionId: string,
    payload: { winnerMasked: string | null; amountCents: number | null },
  ): void {
    this.server.to(this.room(auctionId)).emit('auction:closed', payload);
  }

  // Avisa a la room de la subasta de que está a punto de cerrar (tarea 08). No es
  // información personal (todos los que miran ven la cuenta atrás), así que va a la
  // room de la subasta, no a rooms de usuario. Lo llama AuctionsService.notifyEndingSoon.
  broadcastEndingSoon(auctionId: string, endsAt: Date): void {
    this.server
      .to(this.room(auctionId))
      .emit('auction:ending-soon', { endsAt });
  }

  // Avisa a UN usuario (todas sus pestañas) de que le han superado (tarea 08). Va a
  // su room personal, no a la de la subasta: es información dirigida.
  notifyOutbid(
    userId: string,
    payload: { auctionId: string; amountCents: number },
  ): void {
    this.server.to(this.userRoom(userId)).emit('notification:outbid', payload);
  }

  // Avisa a UN usuario de que ha ganado (tarea 08). `secondChance` distingue el
  // cierre normal de la segunda oportunidad por impago (tarea 07).
  notifyWon(
    userId: string,
    payload: { auctionId: string; amountCents: number; secondChance: boolean },
  ): void {
    this.server.to(this.userRoom(userId)).emit('notification:won', payload);
  }

  // Tira las entradas del rate limit que ya no pueden frenar nada (más viejas que
  // la ventana). Se llama tras cada puja aceptada, pero solo hace trabajo una vez
  // por RATE_LIMIT_SWEEP_MS: el coste amortizado es despreciable y el mapa queda
  // acotado a los usuarios que están pujando ahora mismo, no a todos los que
  // pujaron alguna vez desde que arrancó el proceso.
  private sweepRateLimit(now: number): void {
    if (now - this.lastSweepAt < RATE_LIMIT_SWEEP_MS) return;
    this.lastSweepAt = now;
    for (const [userId, at] of this.lastBidAt) {
      if (now - at >= MIN_BID_INTERVAL_MS) {
        this.lastBidAt.delete(userId);
      }
    }
  }

  private room(auctionId: string): string {
    return `auction:${auctionId}`;
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  // Traduce la excepción del servicio al payload { code, message } del canal. Si
  // es un ConflictException con nuestro { code, message }, se reenvía tal cual.
  private toRejection(error: unknown): { code: string; message: string } {
    if (error instanceof ConflictException) {
      const res = error.getResponse();
      if (typeof res === 'object' && res !== null && 'code' in res) {
        return res as { code: string; message: string };
      }
    }
    this.logger.warn(`Puja rechazada por error inesperado: ${String(error)}`);
    return { code: 'REJECTED', message: 'No se pudo registrar la puja' };
  }
}
