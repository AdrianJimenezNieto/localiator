import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuctionStatus } from '@prisma/client';
import {
  AuctionAdminReason,
  AuctionsService,
  BidRejectReason,
} from './auctions.service';
import { AuctionsGateway } from './auctions.gateway';
import { ANTISNIPE_WINDOW_MS } from './auctions.constants';
import { AuctionMailService } from '../mail/auction-mail.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  user: { findUnique: jest.fn(), updateMany: jest.fn() },
  auction: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  // Gestión de admin (tarea 11): el alta comprueba a mano que el Product/Lot del
  // itemId existe, porque el polimórfico no tiene FK que lo garantice.
  product: { findUnique: jest.fn(), findMany: jest.fn() },
  lot: { findUnique: jest.fn(), findMany: jest.fn() },
  bid: {
    findFirst: jest.fn(),
    create: jest.fn(),
    // La edición de admin comprueba "¿ya hay pujas?" con un count (antes miraba la
    // puja máxima, que con proxy ya no es quien manda).
    count: jest.fn(),
  },
  // order: la rama "moroso baneado y sin siguiente" busca su pedido PENDING
  // huérfano para cancelarlo (tarea 09) y borrar su reserva (tarea 15).
  order: { findMany: jest.fn(), updateMany: jest.fn() },
  // stockReservation: la reserva del ganador se borra al quedar la subasta desierta,
  // para que el artículo vuelva al catálogo (tarea 15).
  stockReservation: { deleteMany: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

// El servicio emite a la room tras registrar la puja (punto único de emisión) y,
// si el antisniping mueve el cierre, avisa con broadcastExtended; al cerrar,
// broadcastClosed. Notificaciones dirigidas (tarea 08): notifyOutbid/notifyWon a la
// room de usuario, broadcastEndingSoon a la room de la subasta.
const gatewayMock = {
  broadcastBidAccepted: jest.fn(),
  broadcastExtended: jest.fn(),
  broadcastClosed: jest.fn(),
  broadcastEndingSoon: jest.fn(),
  // Apertura automática (tarea 10): la room ve pasar la subasta a "en directo".
  broadcastOpened: jest.fn(),
  notifyOutbid: jest.fn(),
  notifyWon: jest.fn(),
};

// Emails de subasta (tarea 08): se comprueba que se disparan, pero el transporte
// está mockeado (no se envía nada real).
const mailMock = {
  sendOutbid: jest.fn(),
  sendWon: jest.fn(),
  sendBannedForNonPayment: jest.fn(),
  sendEndingSoon: jest.fn(),
};

// Cobro del ganador (tarea 09): OrdersService.createAuctionOrder crea el pedido del
// ganador dentro de la transacción de cierre/reasignación. Aquí solo se verifica que
// se llama con los datos correctos; la lógica del pedido se prueba en orders.spec.
const ordersMock = {
  createAuctionOrder: jest.fn().mockResolvedValue({ id: 'order-1' }),
};

// Fila que devolvería el SELECT ... FOR UPDATE de la subasta bloqueada. Misma
// forma que las validaciones necesitan; por defecto, LIVE y dentro de ventana.
const now = Date.now();
const lockedRow = {
  status: 'LIVE',
  startsAt: new Date(now - 60 * 60 * 1000),
  endsAt: new Date(now + 60 * 60 * 1000),
  startingPriceCents: 4500,
  minIncrementCents: 500,
  // Estado de la puja proxy. Por defecto la subasta está virgen; los tests que
  // necesitan un líder usan `conLider(...)`.
  currentPriceCents: null as number | null,
  leaderUserId: null as string | null,
  leaderMaxCents: null as number | null,
};

// Estado de subasta con alguien liderando: precio efectivo visible y techo oculto.
// Se aplica a la vez a la fila bloqueada y a la del fast path, porque placeBid
// resuelve el proxy en las dos fases y ambas deben contar lo mismo.
function conLider(
  leaderUserId: string,
  currentPriceCents: number,
  leaderMaxCents: number,
) {
  return { currentPriceCents, leaderUserId, leaderMaxCents };
}

const verifiedUser = { emailVerifiedAt: new Date(), bannedAt: null };

// Subasta LIVE base: empezó hace una hora, cierra dentro de una hora. Cada test
// la ajusta con un spread si necesita otro estado/ventana.
const liveAuction = {
  id: 'auction-1',
  itemType: 'PRODUCT',
  itemId: 'product-1',
  startingPriceCents: 4500,
  minIncrementCents: 500,
  startsAt: new Date(now - 60 * 60 * 1000),
  endsAt: new Date(now + 60 * 60 * 1000),
  status: AuctionStatus.LIVE,
  winnerUserId: null,
  winningBidId: null,
  currentPriceCents: null as number | null,
  leaderUserId: null as string | null,
  leaderMaxCents: null as number | null,
};

// Lee el `code` del payload del 409 para aserciones legibles.
function rejectCode(error: unknown): string {
  const response = (error as ConflictException).getResponse();
  return (response as { code: string }).code;
}

describe('AuctionsService', () => {
  let service: AuctionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Por defecto: usuario verificado, subasta LIVE, sin pujas previas.
    prismaMock.user.findUnique.mockResolvedValue(verifiedUser);
    prismaMock.auction.findUnique.mockResolvedValue(liveAuction);
    prismaMock.bid.findFirst.mockResolvedValue(null);
    prismaMock.bid.count.mockResolvedValue(0);
    prismaMock.bid.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'bid-new', createdAt: new Date(), ...data }),
    );
    // La transacción interactiva ejecuta el callback con el propio mock como `tx`
    // (mismo patrón que el spec de orders). El SELECT ... FOR UPDATE devuelve la
    // fila bloqueada por defecto.
    prismaMock.$transaction.mockImplementation(
      (cb: (tx: typeof prismaMock) => unknown) => cb(prismaMock),
    );
    prismaMock.$queryRaw.mockResolvedValue([lockedRow]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuctionsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuctionsGateway, useValue: gatewayMock },
        { provide: AuctionMailService, useValue: mailMock },
        { provide: OrdersService, useValue: ordersMock },
      ],
    }).compile();
    service = moduleRef.get(AuctionsService);
  });

  it('la primera puja se queda en el PRECIO DE SALIDA aunque el máximo sea enorme', async () => {
    const bid = await service.placeBid('auction-1', 'user-1', {
      maxAmountCents: 50_000,
    });

    // Lo esencial del proxy: autorizar 500 € no significa pagar 500 €.
    expect(bid).toMatchObject({ auctionId: 'auction-1', amountCents: 4500 });
    expect(prismaMock.bid.create).toHaveBeenCalledWith({
      data: {
        auctionId: 'auction-1',
        userId: 'user-1',
        amountCents: 4500,
        maxAmountCents: 50_000,
      },
    });
    // Se difunde SOLO el precio efectivo, nunca el techo.
    expect(gatewayMock.broadcastBidAccepted).toHaveBeenCalledWith(
      'auction-1',
      expect.objectContaining({ amountCents: 4500 }),
    );
    const [, payload] = gatewayMock.broadcastBidAccepted.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(JSON.stringify(payload)).not.toContain('50000');
  });

  it('rechaza la primera puja por debajo del precio de salida', async () => {
    await expect(
      service.placeBid('auction-1', 'user-1', { maxAmountCents: 4499 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('rechaza un máximo que no supera el precio actual + el incremento', async () => {
    const conOtroLider = conLider('other', 5000, 5000);
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      ...conOtroLider,
    });
    prismaMock.$queryRaw.mockResolvedValue([{ ...lockedRow, ...conOtroLider }]);

    // Precio 5000 + incremento 500 = 5500 mínimo; 5400 no llega.
    const error = await service
      .placeBid('auction-1', 'user-1', { maxAmountCents: 5400 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(rejectCode(error)).toBe(BidRejectReason.BID_TOO_LOW);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('el proxy del líder aguanta: sube solo lo justo y el retador nace superado', async () => {
    // Ana lidera a 5000 con un techo OCULTO de 20 000.
    const anaLidera = conLider('ana', 5000, 20_000);
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      ...anaLidera,
    });
    prismaMock.$queryRaw.mockResolvedValue([{ ...lockedRow, ...anaLidera }]);

    await service.placeBid('auction-1', 'bruno', { maxAmountCents: 6000 });

    // El precio sube a 6500 (6000 + incremento), MUY lejos del techo de Ana.
    expect(prismaMock.auction.update).toHaveBeenCalledWith({
      where: { id: 'auction-1' },
      data: {
        currentPriceCents: 6500,
        leaderUserId: 'ana',
        leaderMaxCents: 20_000,
      },
    });
    // Al que se avisa es a Bruno, que ya está superado. A Ana NO se la molesta:
    // su máximo sigue en pie y ese es justo el sentido del proxy.
    expect(gatewayMock.notifyOutbid).toHaveBeenCalledTimes(1);
    expect(gatewayMock.notifyOutbid).toHaveBeenCalledWith(
      'bruno',
      expect.objectContaining({ amountCents: 6500 }),
    );
    expect(mailMock.sendOutbid).toHaveBeenCalledWith('bruno', 'auction-1');
    // El precio que ve la sala lo puso el PROXY de Ana, no una persona: va marcado
    // como automático para que la ficha en vivo explique por qué sube solo. Y va a
    // nombre de Ana (la líder), enmascarada, nunca con su techo.
    expect(gatewayMock.broadcastBidAccepted).toHaveBeenCalledWith(
      'auction-1',
      expect.objectContaining({ amountCents: 6500, isAutomatic: true }),
    );
  });

  it('el retador que supera el techo del líder se lleva la subasta pagando el salto justo', async () => {
    const anaLidera = conLider('ana', 5000, 20_000);
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      ...anaLidera,
    });
    prismaMock.$queryRaw.mockResolvedValue([{ ...lockedRow, ...anaLidera }]);

    await service.placeBid('auction-1', 'bruno', { maxAmountCents: 100_000 });

    // Bruno no paga sus 100 000: solo 20 000 + 500.
    expect(prismaMock.auction.update).toHaveBeenCalledWith({
      where: { id: 'auction-1' },
      data: {
        currentPriceCents: 20_500,
        leaderUserId: 'bruno',
        leaderMaxCents: 100_000,
      },
    });
    // Ahora sí: a Ana le han superado el máximo y hay que avisarla (WS + email).
    expect(gatewayMock.notifyOutbid).toHaveBeenCalledWith(
      'ana',
      expect.objectContaining({ amountCents: 20_500 }),
    );
    expect(mailMock.sendOutbid).toHaveBeenCalledWith('ana', 'auction-1');
    // Aquí el precio SÍ lo puso una persona (Bruno), así que no va marcado.
    expect(gatewayMock.broadcastBidAccepted).toHaveBeenCalledWith(
      'auction-1',
      expect.objectContaining({ amountCents: 20_500, isAutomatic: false }),
    );
  });

  it('el líder puede subir su propio techo sin mover el precio ni avisar a nadie', async () => {
    const anaLidera = conLider('ana', 5000, 20_000);
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      ...anaLidera,
    });
    prismaMock.$queryRaw.mockResolvedValue([{ ...lockedRow, ...anaLidera }]);

    await service.placeBid('auction-1', 'ana', { maxAmountCents: 50_000 });

    // Solo cambia el techo; el precio y el líder siguen igual.
    expect(prismaMock.auction.update).toHaveBeenCalledWith({
      where: { id: 'auction-1' },
      data: { leaderMaxCents: 50_000 },
    });
    // La sala no percibe NADA: ni precio nuevo, ni extensión, ni avisos.
    expect(gatewayMock.broadcastBidAccepted).not.toHaveBeenCalled();
    expect(gatewayMock.notifyOutbid).not.toHaveBeenCalled();
  });

  it('rechaza al líder que intenta bajar o repetir su propio máximo', async () => {
    const anaLidera = conLider('ana', 5000, 20_000);
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      ...anaLidera,
    });
    prismaMock.$queryRaw.mockResolvedValue([{ ...lockedRow, ...anaLidera }]);

    const error = await service
      .placeBid('auction-1', 'ana', { maxAmountCents: 20_000 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.MAX_NOT_INCREASED);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('toma el bloqueo de fila (SELECT ... FOR UPDATE) al registrar la puja', async () => {
    await service.placeBid('auction-1', 'user-1', { maxAmountCents: 4500 });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
  });

  it('rechaza con OUTBID cuando otra puja se cuela entre el fast path y el lock', async () => {
    // Fast path ve el precio en 5000 (mín. 5500): la puja de 5500 pasa la fase 1.
    // Bajo el lock el precio ya avanzó a 5500 (otra puja ganó la carrera): ahora el
    // mínimo es 6000, así que 5500 se rechaza como OUTBID, no como BID_TOO_LOW.
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      ...conLider('other', 5000, 5000),
    });
    prismaMock.$queryRaw.mockResolvedValue([
      { ...lockedRow, ...conLider('other2', 5500, 5500) },
    ]);

    const error = await service
      .placeBid('auction-1', 'user-1', { maxAmountCents: 5500 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.OUTBID);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  // Toda puja escribe ya el estado del proxy con auction.update, así que "no hubo
  // extensión" no puede afirmarse mirando si update se llamó: hay que mirar si
  // ALGUNA de esas escrituras tocó `endsAt`.
  function huboExtensionEnBd(): boolean {
    const calls = prismaMock.auction.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    return calls.some((c) => 'endsAt' in c[0].data);
  }

  it('antisniping: NO extiende el cierre si la puja llega con margen (10 min)', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { ...lockedRow, endsAt: new Date(now + 10 * 60 * 1000) },
    ]);

    await service.placeBid('auction-1', 'user-1', { maxAmountCents: 4500 });

    expect(huboExtensionEnBd()).toBe(false);
    expect(gatewayMock.broadcastExtended).not.toHaveBeenCalled();
  });

  it('antisniping: extiende el cierre a now + la ventana si la puja llega en los últimos minutos', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      // Dentro de la ventana del antisniping, sea cual sea su valor: la mitad.
      { ...lockedRow, endsAt: new Date(now + ANTISNIPE_WINDOW_MS / 2) },
    ]);

    const before = Date.now();
    await service.placeBid('auction-1', 'user-1', { maxAmountCents: 4500 });

    // Se movió el cierre en BD a ~ now + la ventana y se avisó a la room.
    const updateCalls = prismaMock.auction.update.mock.calls as Array<
      [{ data: { endsAt?: Date } }]
    >;
    const updateArg = updateCalls.find((c) => 'endsAt' in c[0].data)![0] as {
      data: { endsAt: Date };
    };
    const newEndsMs = updateArg.data.endsAt.getTime();
    expect(newEndsMs).toBeGreaterThanOrEqual(
      before + ANTISNIPE_WINDOW_MS - 1000,
    );
    expect(newEndsMs).toBeLessThanOrEqual(
      Date.now() + ANTISNIPE_WINDOW_MS + 1000,
    );
    expect(gatewayMock.broadcastExtended).toHaveBeenCalledWith(
      'auction-1',
      updateArg.data.endsAt,
    );
  });

  it('rechaza pujar tras endsAt (subasta cerrada)', async () => {
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      endsAt: new Date(now - 1000), // cerró hace un segundo.
    });

    const error = await service
      .placeBid('auction-1', 'user-1', { maxAmountCents: 9999 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.AUCTION_CLOSED);
  });

  it('rechaza pujar en una subasta que no está LIVE', async () => {
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      status: AuctionStatus.SCHEDULED,
    });

    const error = await service
      .placeBid('auction-1', 'user-1', { maxAmountCents: 9999 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.AUCTION_CLOSED);
  });

  it('exige email verificado para pujar', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    await expect(
      service.placeBid('auction-1', 'user-1', { maxAmountCents: 4500 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('devuelve 404 si la subasta no existe', async () => {
    prismaMock.auction.findUnique.mockResolvedValue(null);

    await expect(
      service.placeBid('missing', 'user-1', { maxAmountCents: 4500 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza con BANNED a un usuario baneado por impago (tarea 07)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
      bannedAt: new Date(),
    });

    const error = await service
      .placeBid('auction-1', 'user-1', { maxAmountCents: 4500 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(rejectCode(error)).toBe(BidRejectReason.BANNED);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('avisa "superado" al líder anterior una sola vez (tarea 08)', async () => {
    // Había un líder ('other') a 5000 con techo 5000; user-1 sube a 5500 y lo
    // destrona superando su máximo, que es la única condición que dispara el aviso.
    const otroLidera = conLider('other', 5000, 5000);
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      ...otroLidera,
    });
    prismaMock.$queryRaw.mockResolvedValue([{ ...lockedRow, ...otroLidera }]);

    await service.placeBid('auction-1', 'user-1', { maxAmountCents: 5500 });

    // Se avisa SOLO al líder superado, por WS y por email de respaldo.
    expect(gatewayMock.notifyOutbid).toHaveBeenCalledTimes(1);
    expect(gatewayMock.notifyOutbid).toHaveBeenCalledWith('other', {
      auctionId: 'auction-1',
      amountCents: 5500,
    });
    expect(mailMock.sendOutbid).toHaveBeenCalledWith('other', 'auction-1');
  });

  it('no avisa "superado" en la primera puja (no había líder)', async () => {
    await service.placeBid('auction-1', 'user-1', { maxAmountCents: 4500 });

    expect(gatewayMock.notifyOutbid).not.toHaveBeenCalled();
    expect(mailMock.sendOutbid).not.toHaveBeenCalled();
  });

  it('antisniping: al extender el cierre reinicia el guard de "a punto de cerrar"', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { ...lockedRow, endsAt: new Date(now + 2 * 60 * 1000) }, // quedan 2 min.
    ]);

    await service.placeBid('auction-1', 'user-1', { maxAmountCents: 4500 });

    const updateCalls = prismaMock.auction.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    // El update del antisniping también pone endingSoonNotifiedAt a null (reevaluar).
    // Es el que toca `endsAt`; el otro update de la puja escribe el estado del proxy.
    const extension = updateCalls.find((c) => 'endsAt' in c[0].data)![0];
    expect(extension.data).toMatchObject({ endingSoonNotifiedAt: null });
  });

  // Listado público (tarea 12): lo que permite descubrir las subastas. Hasta esta
  // tarea la única forma de llegar a una era escribir su id en la URL.
  describe('listPublicAuctions', () => {
    // Fila tal y como la devuelve el findMany con sus includes.
    const row = {
      ...liveAuction,
      bids: [] as { amountCents: number }[],
      _count: { bids: 0 },
    };

    beforeEach(() => {
      // $transaction con ARRAY de promesas (no callback): el listado lo usa para
      // que findMany y count sean coherentes. El default del suite es la versión
      // callback, así que aquí se sobreescribe.
      prismaMock.$transaction.mockImplementation((ops: unknown) =>
        Array.isArray(ops) ? Promise.all(ops) : Promise.resolve([]),
      );
      prismaMock.auction.findMany.mockResolvedValue([row]);
      prismaMock.auction.count.mockResolvedValue(1);
      prismaMock.product.findMany.mockResolvedValue([
        { id: 'product-1', name: 'Taladro', photos: ['foto.jpg'] },
      ]);
      prismaMock.lot.findMany.mockResolvedValue([]);
    });

    it('por defecto solo devuelve subastas LIVE y SCHEDULED', async () => {
      await service.listPublicAuctions({});

      const [call] = prismaMock.auction.findMany.mock.calls as Array<
        [{ where: { status: { in: string[] } } }]
      >;
      expect(call[0].where.status.in).toEqual([
        AuctionStatus.LIVE,
        AuctionStatus.SCHEDULED,
      ]);
    });

    it('muestra el precio de salida cuando aún no hay pujas', async () => {
      const result = await service.listPublicAuctions({});

      expect(result.items[0]).toMatchObject({
        name: 'Taladro',
        photo: 'foto.jpg',
        currentPriceCents: 4500, // el precio de salida.
        bidCount: 0,
      });
      expect(result.total).toBe(1);
    });

    it('muestra el precio efectivo del proxy como precio actual', async () => {
      prismaMock.auction.findMany.mockResolvedValue([
        { ...row, currentPriceCents: 7000, _count: { bids: 3 } },
      ]);

      const result = await service.listPublicAuctions({});

      expect(result.items[0]).toMatchObject({
        currentPriceCents: 7000,
        bidCount: 3,
      });
    });

    // Un listado público es el peor sitio para filtrar datos de usuario. La tarjeta
    // no necesita saber QUIÉN puja, así que no se devuelve ni enmascarado.
    it('no devuelve ningún dato de los pujadores', async () => {
      prismaMock.auction.findMany.mockResolvedValue([
        { ...row, currentPriceCents: 7000, _count: { bids: 3 } },
      ]);

      const result = await service.listPublicAuctions({});

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('userId');
      expect(serialized).not.toContain('winner');
    });

    // Dos consultas (una por tabla), no una por subasta: el N+1 aquí sería el
    // camino caliente del listado.
    it('resuelve los artículos en bloque, sin N+1', async () => {
      prismaMock.auction.findMany.mockResolvedValue([
        row,
        { ...row, id: 'auction-2', itemId: 'product-2' },
        { ...row, id: 'auction-3', itemType: 'LOT', itemId: 'lot-1' },
      ]);

      await service.listPublicAuctions({});

      expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.lot.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    });

    it('pagina con skip/take y respeta el tamaño de página', async () => {
      await service.listPublicAuctions({ page: 3, pageSize: 10 });

      const [call] = prismaMock.auction.findMany.mock.calls as Array<
        [{ skip: number; take: number }]
      >;
      expect(call[0]).toMatchObject({ skip: 20, take: 10 });
    });
  });

  // Calendario público: mismas tarjetas que el listado, pero filtradas por rango
  // de cierre y SIN paginar (la rejilla necesita el mes entero). El interés está
  // en el rango: sus fronteras y su tope.
  describe('listAuctionsForCalendar', () => {
    const row = {
      ...liveAuction,
      bids: [] as { amountCents: number }[],
      _count: { bids: 0 },
    };

    // Un mes cualquiera, en el formato que manda el front.
    const range = {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    };

    beforeEach(() => {
      prismaMock.auction.findMany.mockResolvedValue([row]);
      prismaMock.product.findMany.mockResolvedValue([
        { id: 'product-1', name: 'Taladro', photos: ['foto.jpg'] },
      ]);
      prismaMock.lot.findMany.mockResolvedValue([]);
    });

    // Semiabierto [from, to): el instante `to` ya es del mes siguiente. Si fuera
    // cerrado, una subasta que cierra justo en la frontera saldría en los dos meses.
    it('filtra por un rango semiabierto sobre endsAt', async () => {
      await service.listAuctionsForCalendar(range);

      const [call] = prismaMock.auction.findMany.mock.calls as Array<
        [{ where: { endsAt: { gte: Date; lt: Date } }; orderBy: unknown }]
      >;
      expect(call[0].where.endsAt).toEqual({
        gte: new Date(range.from),
        lt: new Date(range.to),
      });
      expect(call[0].orderBy).toEqual({ endsAt: 'asc' });
    });

    // Incluye CLOSED, al revés que el listado: en un calendario se navega a meses
    // pasados, y un mes vacío parecería que la página está rota. PAID y CANCELLED
    // siguen sin salir (son estado interno).
    it('incluye las cerradas pero nunca PAID ni CANCELLED', async () => {
      await service.listAuctionsForCalendar(range);

      const [call] = prismaMock.auction.findMany.mock.calls as Array<
        [{ where: { status: { in: string[] } } }]
      >;
      expect(call[0].where.status.in).toEqual(
        expect.arrayContaining([
          AuctionStatus.LIVE,
          AuctionStatus.SCHEDULED,
          AuctionStatus.CLOSED,
        ]),
      );
      expect(call[0].where.status.in).not.toContain(AuctionStatus.PAID);
      expect(call[0].where.status.in).not.toContain(AuctionStatus.CANCELLED);
    });

    // Sin paginar: la rejilla necesita TODAS las del mes. Una página dejaría días
    // sin marcar aunque tuvieran subastas, y sin dar ningún error.
    it('no pagina', async () => {
      await service.listAuctionsForCalendar(range);

      const [call] = prismaMock.auction.findMany.mock.calls as Array<
        [{ skip?: number; take?: number }]
      >;
      expect(call[0].skip).toBeUndefined();
      expect(call[0].take).toBeUndefined();
    });

    it('devuelve las mismas tarjetas que el listado', async () => {
      prismaMock.auction.findMany.mockResolvedValue([
        { ...row, currentPriceCents: 7000, _count: { bids: 3 } },
      ]);

      const items = await service.listAuctionsForCalendar(range);

      expect(items[0]).toMatchObject({
        name: 'Taladro',
        photo: 'foto.jpg',
        currentPriceCents: 7000,
        bidCount: 3,
        endsAt: liveAuction.endsAt.toISOString(),
      });
      // Público: ni siquiera enmascarado se filtra quién puja.
      expect(JSON.stringify(items)).not.toContain('userId');
    });

    it('resuelve los artículos en bloque, sin N+1', async () => {
      prismaMock.auction.findMany.mockResolvedValue([
        row,
        { ...row, id: 'auction-2', itemId: 'product-2' },
        { ...row, id: 'auction-3', itemType: 'LOT', itemId: 'lot-1' },
      ]);

      await service.listAuctionsForCalendar(range);

      expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.lot.findMany).toHaveBeenCalledTimes(1);
    });

    // Sin paginación, el tope de ventana es lo ÚNICO que acota el coste: sin él,
    // `from=2000&to=2100` se traería la tabla entera.
    it('rechaza un rango mayor que el tope', async () => {
      await expect(
        service.listAuctionsForCalendar({
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-06-01T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.auction.findMany).not.toHaveBeenCalled();
    });

    it('rechaza un rango invertido o vacío', async () => {
      await expect(
        service.listAuctionsForCalendar({ from: range.to, to: range.from }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.listAuctionsForCalendar({ from: range.from, to: range.from }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.auction.findMany).not.toHaveBeenCalled();
    });
  });

  // Gestión de admin (tarea 11). El interés está en las validaciones: sin ellas se
  // podría subastar un artículo inexistente (el itemType/itemId es polimórfico y no
  // hay FK que lo impida) o cambiar las reglas con pujas ya puestas.
  describe('gestión de admin', () => {
    const validDto = {
      itemType: 'PRODUCT' as const,
      itemId: 'product-1',
      startingPriceCents: 4500,
      minIncrementCents: 500,
      startsAt: new Date(now + 60 * 60 * 1000).toISOString(),
      endsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    };

    beforeEach(() => {
      // Por defecto: el artículo existe y no hay ninguna subasta viva sobre él.
      prismaMock.product.findUnique.mockResolvedValue({ id: 'product-1' });
      prismaMock.lot.findUnique.mockResolvedValue(null);
      prismaMock.auction.findFirst.mockResolvedValue(null);
      prismaMock.auction.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'auction-new', ...data }),
      );
    });

    describe('createAuction', () => {
      // Nace SCHEDULED aunque su startsAt ya haya pasado: abrirla es competencia
      // del cron (tarea 10), para que un solo sitio decida cuándo está viva.
      it('crea la subasta programada y deja que el cron la abra', async () => {
        const created = await service.createAuction(validDto);

        expect(created).toMatchObject({ status: AuctionStatus.SCHEDULED });
      });

      it('rechaza subastar un artículo que no existe', async () => {
        prismaMock.product.findUnique.mockResolvedValue(null);

        await expect(service.createAuction(validDto)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prismaMock.auction.create).not.toHaveBeenCalled();
      });

      it('rechaza un artículo que ya tiene una subasta viva', async () => {
        prismaMock.auction.findFirst.mockResolvedValue({ id: 'auction-old' });

        await expect(service.createAuction(validDto)).rejects.toMatchObject({
          response: { code: AuctionAdminReason.AUCTION_ALREADY_ACTIVE },
        });
      });

      it('rechaza una ventana que cierra antes de empezar', async () => {
        await expect(
          service.createAuction({
            ...validDto,
            startsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
            endsAt: new Date(now + 60 * 60 * 1000).toISOString(),
          }),
        ).rejects.toMatchObject({
          response: { code: AuctionAdminReason.INVALID_DATES },
        });
      });

      it('rechaza una subasta que nace ya vencida', async () => {
        await expect(
          service.createAuction({
            ...validDto,
            startsAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            endsAt: new Date(now - 60 * 60 * 1000).toISOString(),
          }),
        ).rejects.toMatchObject({
          response: { code: AuctionAdminReason.INVALID_DATES },
        });
      });
    });

    describe('updateAuction', () => {
      it('permite editarlo todo mientras está programada y sin pujas', async () => {
        prismaMock.auction.findUnique.mockResolvedValue({
          ...liveAuction,
          status: AuctionStatus.SCHEDULED,
        });
        prismaMock.bid.findFirst.mockResolvedValue(null);
        prismaMock.auction.update.mockResolvedValue({});

        await service.updateAuction('auction-1', {
          startingPriceCents: 9900,
        });

        const [call] = prismaMock.auction.update.mock.calls as Array<
          [{ data: Record<string, unknown> }]
        >;
        expect(call[0].data).toMatchObject({ startingPriceCents: 9900 });
      });

      // La regla interesante: con pujas puestas, cambiar el precio de salida o el
      // incremento invalidaría pujas hechas bajo las reglas viejas.
      it('congela las reglas de una subasta en curso con pujas', async () => {
        prismaMock.auction.findUnique.mockResolvedValue(liveAuction);
        prismaMock.bid.count.mockResolvedValue(1); // ya hay pujas.

        await expect(
          service.updateAuction('auction-1', { startingPriceCents: 9900 }),
        ).rejects.toMatchObject({
          response: { code: AuctionAdminReason.AUCTION_HAS_BIDS },
        });
      });

      it('deja alargar el cierre de una subasta con pujas, pero no acortarlo', async () => {
        prismaMock.auction.findUnique.mockResolvedValue(liveAuction);
        prismaMock.bid.count.mockResolvedValue(1); // ya hay pujas.
        prismaMock.auction.update.mockResolvedValue({});

        // Acortar: sería un sniping legal del propio admin.
        await expect(
          service.updateAuction('auction-1', {
            endsAt: new Date(now + 10 * 60 * 1000).toISOString(),
          }),
        ).rejects.toMatchObject({
          response: { code: AuctionAdminReason.AUCTION_HAS_BIDS },
        });

        // Alargar: no perjudica a nadie que ya pujó.
        const longer = new Date(now + 3 * 60 * 60 * 1000);
        await service.updateAuction('auction-1', {
          endsAt: longer.toISOString(),
        });
        // Los relojes del front deben enterarse del nuevo cierre.
        expect(gatewayMock.broadcastExtended).toHaveBeenCalledWith(
          'auction-1',
          longer,
        );
      });

      it('no deja editar una subasta ya cerrada', async () => {
        prismaMock.auction.findUnique.mockResolvedValue({
          ...liveAuction,
          status: AuctionStatus.CLOSED,
        });

        await expect(
          service.updateAuction('auction-1', { minIncrementCents: 100 }),
        ).rejects.toMatchObject({
          response: { code: AuctionAdminReason.INVALID_TRANSITION },
        });
      });
    });

    describe('cancelAuction', () => {
      it('cancela una subasta en curso y avisa a la room', async () => {
        prismaMock.auction.findUnique.mockResolvedValue({
          status: AuctionStatus.LIVE,
        });
        prismaMock.auction.update.mockResolvedValue({});

        await service.cancelAuction('auction-1');

        const [call] = prismaMock.auction.update.mock.calls as Array<
          [{ data: Record<string, unknown> }]
        >;
        expect(call[0].data).toEqual({ status: AuctionStatus.CANCELLED });
        // Puede haber gente con pujas puestas mirando la ficha.
        expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith('auction-1', {
          winnerMasked: null,
          amountCents: null,
        });
      });

      // Cancelar a mano una CLOSED se saltaría el flujo de impago (tarea 07), que
      // banea y ofrece segunda oportunidad, y dejaría huérfano el pedido del ganador.
      it('no cancela una subasta ya cerrada con ganador', async () => {
        prismaMock.auction.findUnique.mockResolvedValue({
          status: AuctionStatus.CLOSED,
        });

        await expect(service.cancelAuction('auction-1')).rejects.toMatchObject({
          response: { code: AuctionAdminReason.INVALID_TRANSITION },
        });
      });
    });

    describe('getAuctionForAdmin', () => {
      it('devuelve el detalle con el nombre del artículo y el nº de pujas', async () => {
        prismaMock.auction.findUnique.mockResolvedValue({
          ...liveAuction,
          currentPriceCents: 7000,
          _count: { bids: 3 },
        });
        prismaMock.product.findMany.mockResolvedValue([
          { id: 'product-1', name: 'Taladro', photos: [] },
        ]);
        prismaMock.lot.findMany.mockResolvedValue([]);

        const result = await service.getAuctionForAdmin('auction-1');

        expect(result).toMatchObject({
          itemName: 'Taladro',
          currentPriceCents: 7000,
          bidCount: 3,
        });
      });

      it('lanza NotFoundException si la subasta no existe', async () => {
        prismaMock.auction.findUnique.mockResolvedValue(null);

        await expect(
          service.getAuctionForAdmin('auction-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });

  // Apertura automática (tarea 10). Sin esto una subasta creada desde el admin se
  // quedaría SCHEDULED para siempre y toda puja se rechazaría con AUCTION_CLOSED.
  describe('openAuction', () => {
    // Subasta programada cuyo `startsAt` ya llegó: candidata a abrirse.
    const scheduledDue = {
      ...liveAuction,
      status: AuctionStatus.SCHEDULED,
      startsAt: new Date(now - 1000),
      endsAt: new Date(now + 60 * 60 * 1000),
    };

    it('abre (LIVE) la subasta programada cuyo startsAt ya llegó', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(scheduledDue);
      prismaMock.auction.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.openAuction('auction-1');

      expect(result).toEqual({ outcome: 'opened' });
      const [call] = prismaMock.auction.updateMany.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(call[0].data).toEqual({ status: AuctionStatus.LIVE });
      expect(gatewayMock.broadcastOpened).toHaveBeenCalledWith(
        'auction-1',
        scheduledDue.endsAt,
      );
    });

    it('no toca la subasta programada cuyo startsAt aún no ha llegado', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...scheduledDue,
        startsAt: new Date(now + 60 * 60 * 1000),
      });

      const result = await service.openAuction('auction-1');

      expect(result).toEqual({ outcome: 'not_due' });
      expect(prismaMock.auction.updateMany).not.toHaveBeenCalled();
      expect(gatewayMock.broadcastOpened).not.toHaveBeenCalled();
    });

    // Caso borde: la API estuvo caída todo el intervalo de la subasta. No se abre
    // para cerrarla al minuto siguiente; se cierra directa y desierta.
    it('cierra sin abrir la subasta cuyo intervalo pasó entero', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        ...scheduledDue,
        startsAt: new Date(now - 2 * 60 * 60 * 1000),
        endsAt: new Date(now - 1000),
      });
      prismaMock.auction.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.openAuction('auction-1');

      expect(result).toEqual({ outcome: 'closed_expired' });
      const [call] = prismaMock.auction.updateMany.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(call[0].data).toEqual({ status: AuctionStatus.CLOSED });
      // Desierta: se avisa a la room sin ganador, y nunca pasó por LIVE.
      expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith('auction-1', {
        winnerMasked: null,
        amountCents: null,
      });
      expect(gatewayMock.broadcastOpened).not.toHaveBeenCalled();
    });

    it('no reabre una subasta que ya está LIVE (idempotencia)', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(liveAuction);

      const result = await service.openAuction('auction-1');

      expect(result).toEqual({ outcome: 'noop' });
      expect(prismaMock.auction.updateMany).not.toHaveBeenCalled();
    });

    // Dos pasadas del cron solapadas: el updateMany condicional solo lo gana una.
    it('no abre dos veces si otra pasada la reclamó primero', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(scheduledDue);
      prismaMock.auction.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.openAuction('auction-1');

      expect(result).toEqual({ outcome: 'noop' });
      expect(gatewayMock.broadcastOpened).not.toHaveBeenCalled();
    });

    it('devuelve not_found si la subasta no existe', async () => {
      prismaMock.auction.findUnique.mockResolvedValue(null);

      expect(await service.openAuction('nope')).toEqual({
        outcome: 'not_found',
      });
    });
  });

  describe('closeAuction', () => {
    // Fila bloqueada de una subasta YA vencida (endsAt en el pasado).
    const dueRow = { ...lockedRow, endsAt: new Date(now - 1000) };

    it('cierra con ganador la subasta vencida con pujas', async () => {
      // El ganador y el precio salen del estado del proxy, no de ordenar pujas: su
      // techo (20 000) queda muy por encima de lo que de verdad paga (5000).
      prismaMock.$queryRaw.mockResolvedValue([
        { ...dueRow, ...conLider('winner-1', 5000, 20_000) },
      ]);
      // La fila Bid solo sirve para apuntar `winningBidId` a algo real.
      prismaMock.bid.findFirst.mockResolvedValue({
        id: 'bid-top',
        userId: 'winner-1',
        amountCents: 5000,
        maxAmountCents: 20_000,
      });
      prismaMock.auction.update.mockResolvedValue({});

      const result = await service.closeAuction('auction-1');

      expect(result).toMatchObject({
        outcome: 'closed_won',
        winnerUserId: 'winner-1',
        winningBidId: 'bid-top',
      });
      const closeCalls = prismaMock.auction.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(closeCalls[0][0]).toMatchObject({
        where: { id: 'auction-1' },
        data: {
          status: AuctionStatus.CLOSED,
          winnerUserId: 'winner-1',
          winningBidId: 'bid-top',
        },
      });
      // Con ganador arranca su plazo de pago (tarea 07).
      expect(closeCalls[0][0].data.paymentDueAt).toBeInstanceOf(Date);
      expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith(
        'auction-1',
        expect.objectContaining({ amountCents: 5000 }),
      );
      // Aviso "has ganado" al ganador (tarea 08): WS + email, cierre normal.
      expect(gatewayMock.notifyWon).toHaveBeenCalledWith('winner-1', {
        auctionId: 'auction-1',
        amountCents: 5000,
        secondChance: false,
      });
      expect(mailMock.sendWon).toHaveBeenCalledWith('winner-1', 5000, false);
      // Cobro (tarea 09): se crea el pedido PENDING del ganador con su puja.
      expect(ordersMock.createAuctionOrder).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          userId: 'winner-1',
          auctionId: 'auction-1',
          amountCents: 5000,
        }),
      );
    });

    it('deja desierta la subasta vencida sin pujas', async () => {
      prismaMock.$queryRaw.mockResolvedValue([dueRow]);
      prismaMock.bid.findFirst.mockResolvedValue(null);
      prismaMock.auction.update.mockResolvedValue({});

      const result = await service.closeAuction('auction-1');

      expect(result).toEqual({ outcome: 'closed_empty' });
      expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith('auction-1', {
        winnerMasked: null,
        amountCents: null,
      });
    });

    it('es idempotente: no reasigna si ya no está LIVE', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { ...dueRow, status: AuctionStatus.CLOSED },
      ]);

      const result = await service.closeAuction('auction-1');

      expect(result).toEqual({ outcome: 'noop' });
      expect(prismaMock.auction.update).not.toHaveBeenCalled();
    });

    it('no cierra si el antisniping extendió el cierre al futuro', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { ...lockedRow, endsAt: new Date(now + 5 * 60 * 1000) },
      ]);

      const result = await service.closeAuction('auction-1');

      expect(result).toEqual({ outcome: 'not_due' });
      expect(prismaMock.auction.update).not.toHaveBeenCalled();
    });
  });

  describe('handleUnpaidWinner', () => {
    // Fila bloqueada de una subasta CERRADA con ganador y plazo de pago VENCIDO.
    const unpaidRow = {
      status: AuctionStatus.CLOSED,
      winnerUserId: 'winner-1',
      paymentDueAt: new Date(now - 1000),
      // Precio que debía el moroso: es el techo del precio que pagará el siguiente.
      currentPriceCents: 8000,
    };

    it('banea al moroso y reasigna al siguiente pujador (segunda oportunidad)', async () => {
      prismaMock.$queryRaw.mockResolvedValue([unpaidRow]);
      // El siguiente en la fila es quien tenía el MÁXIMO más alto de los que
      // quedan vivos, no quien tenía el importe visible más alto.
      prismaMock.bid.findFirst.mockResolvedValue({
        id: 'bid-2',
        userId: 'user-2',
        amountCents: 3000,
        maxAmountCents: 5000,
      });
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.auction.update.mockResolvedValue({});

      const result = await service.handleUnpaidWinner('auction-1');

      expect(result).toMatchObject({
        outcome: 'reassigned',
        bannedUserId: 'winner-1',
        winnerUserId: 'user-2',
        winningBidId: 'bid-2',
        amountCents: 5000,
      });
      // El ban es idempotente: solo si aún no estaba baneado.
      const banCalls = prismaMock.user.updateMany.mock.calls as Array<
        [{ where: object; data: { bannedAt: Date; banReason: string } }]
      >;
      expect(banCalls[0][0].where).toEqual({ id: 'winner-1', bannedAt: null });
      expect(banCalls[0][0].data.bannedAt).toBeInstanceOf(Date);
      expect(banCalls[0][0].data.banReason).toContain('auction-1');
      // El siguiente se busca SOLO entre usuarios no baneados (salta al moroso) y
      // por MÁXIMO, no por importe: con proxy, quien va detrás en la fila es quien
      // tenía el techo más alto. Se excluyen las filas automáticas del proxy.
      expect(prismaMock.bid.findFirst).toHaveBeenCalledWith({
        where: {
          auctionId: 'auction-1',
          isAutomatic: false,
          user: { bannedAt: null },
        },
        orderBy: [{ maxAmountCents: 'desc' }, { createdAt: 'asc' }],
      });
      const calls = prismaMock.auction.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(calls[0][0]).toMatchObject({
        where: { id: 'auction-1' },
        data: { winnerUserId: 'user-2', winningBidId: 'bid-2' },
      });
      // Plazo reiniciado para el nuevo ganador; sigue CLOSED.
      expect(calls[0][0].data.paymentDueAt).toBeInstanceOf(Date);
      expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith(
        'auction-1',
        expect.objectContaining({ amountCents: 5000 }),
      );
      // Segunda oportunidad (tarea 08): "has ganado" al nuevo ganador y email de
      // ban al moroso.
      expect(gatewayMock.notifyWon).toHaveBeenCalledWith('user-2', {
        auctionId: 'auction-1',
        amountCents: 5000,
        secondChance: true,
      });
      expect(mailMock.sendWon).toHaveBeenCalledWith('user-2', 5000, true);
      expect(mailMock.sendBannedForNonPayment).toHaveBeenCalledWith('winner-1');
      // Cobro (tarea 09): pedido del NUEVO ganador (createAuctionOrder cancela antes
      // el pedido PENDING del moroso).
      expect(ordersMock.createAuctionOrder).toHaveBeenCalledWith(
        prismaMock,
        expect.objectContaining({
          userId: 'user-2',
          auctionId: 'auction-1',
          amountCents: 5000,
        }),
      );
    });

    it('sin más pujadores, deja la subasta desierta (cancelada)', async () => {
      prismaMock.$queryRaw.mockResolvedValue([unpaidRow]);
      prismaMock.bid.findFirst.mockResolvedValue(null); // nadie sin banear.
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.auction.update.mockResolvedValue({});
      // El pedido PENDING del moroso, con su reserva de stock (tarea 15).
      prismaMock.order.findMany.mockResolvedValue([{ id: 'order-moroso' }]);

      const result = await service.handleUnpaidWinner('auction-1');

      expect(result).toEqual({
        outcome: 'cancelled_empty',
        bannedUserId: 'winner-1',
      });
      expect(prismaMock.auction.update).toHaveBeenCalledWith({
        where: { id: 'auction-1' },
        data: {
          status: AuctionStatus.CANCELLED,
          winnerUserId: null,
          winningBidId: null,
          paymentDueAt: null,
          // Se limpia también el estado del proxy: si no, la subasta cancelada
          // seguiría diciendo que la lidera el moroso ya baneado.
          currentPriceCents: null,
          leaderUserId: null,
          leaderMaxCents: null,
        },
      });
      expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith('auction-1', {
        winnerMasked: null,
        amountCents: null,
      });
      // Cobro (tarea 09): sin heredero, el pedido PENDING del moroso se cancela y no
      // se crea ninguno nuevo. Y su reserva se BORRA (tarea 15): la subasta quedó
      // desierta, así que el artículo debe volver al catálogo en vez de seguir
      // bloqueado hasta que venza la reserva.
      expect(prismaMock.stockReservation.deleteMany).toHaveBeenCalledWith({
        where: { orderId: { in: ['order-moroso'] } },
      });
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['order-moroso'] } },
        data: { status: 'CANCELLED' },
      });
      expect(ordersMock.createAuctionOrder).not.toHaveBeenCalled();
    });

    it('es idempotente: no actúa si la subasta ya no está CLOSED', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { ...unpaidRow, status: AuctionStatus.PAID },
      ]);

      const result = await service.handleUnpaidWinner('auction-1');

      expect(result).toEqual({ outcome: 'noop' });
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.auction.update).not.toHaveBeenCalled();
    });

    it('no actúa si el plazo de pago aún no ha vencido', async () => {
      prismaMock.$queryRaw.mockResolvedValue([
        { ...unpaidRow, paymentDueAt: new Date(now + 60 * 1000) },
      ]);

      const result = await service.handleUnpaidWinner('auction-1');

      expect(result).toEqual({ outcome: 'not_due' });
      expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.auction.update).not.toHaveBeenCalled();
    });
  });

  describe('notifyEndingSoon (tarea 08)', () => {
    it('reclama el aviso y emite cuando la subasta entra en ventana', async () => {
      // updateMany "gana" la reclamación (marcó 1 fila).
      prismaMock.auction.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.auction.findUnique.mockResolvedValue({
        endsAt: new Date(now + 60 * 1000),
      });

      const emitted = await service.notifyEndingSoon('auction-1');

      expect(emitted).toBe(true);
      expect(gatewayMock.broadcastEndingSoon).toHaveBeenCalledTimes(1);
      expect(mailMock.sendEndingSoon).toHaveBeenCalledWith('auction-1');
    });

    it('no duplica: si otra pasada ya lo reclamó, no emite', async () => {
      // count 0 = el guard del updateMany no marcó nada (ya avisado o fuera de ventana).
      prismaMock.auction.updateMany.mockResolvedValue({ count: 0 });

      const emitted = await service.notifyEndingSoon('auction-1');

      expect(emitted).toBe(false);
      expect(gatewayMock.broadcastEndingSoon).not.toHaveBeenCalled();
      expect(mailMock.sendEndingSoon).not.toHaveBeenCalled();
    });
  });
});
