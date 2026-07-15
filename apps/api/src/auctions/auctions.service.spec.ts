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
import { AuctionMailService } from '../mail/auction-mail.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  user: { findUnique: jest.fn(), updateMany: jest.fn() },
  auction: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
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
  },
  // order.updateMany: lo usa la rama "moroso baneado y sin siguiente" para cancelar
  // su pedido PENDING huérfano (tarea 09).
  order: { updateMany: jest.fn() },
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
};

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

  it('acepta la primera puja igual al precio de salida', async () => {
    const bid = await service.placeBid('auction-1', 'user-1', {
      amountCents: 4500,
    });

    expect(bid).toMatchObject({ auctionId: 'auction-1', amountCents: 4500 });
    expect(prismaMock.bid.create).toHaveBeenCalledWith({
      data: { auctionId: 'auction-1', userId: 'user-1', amountCents: 4500 },
    });
    // Se difunde el nuevo precio a la room, con identidad enmascarada.
    expect(gatewayMock.broadcastBidAccepted).toHaveBeenCalledWith(
      'auction-1',
      expect.objectContaining({ amountCents: 4500 }),
    );
  });

  it('rechaza la primera puja por debajo del precio de salida', async () => {
    await expect(
      service.placeBid('auction-1', 'user-1', { amountCents: 4499 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('rechaza una puja que no supera la máxima por el incremento mínimo', async () => {
    prismaMock.bid.findFirst.mockResolvedValue({
      id: 'bid-1',
      userId: 'other',
      amountCents: 5000,
    });

    // Máxima 5000 + incremento 500 = 5500 mínimo; 5400 no llega.
    const error = await service
      .placeBid('auction-1', 'user-1', { amountCents: 5400 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(rejectCode(error)).toBe(BidRejectReason.BID_TOO_LOW);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('acepta una puja que iguala máxima + incremento', async () => {
    prismaMock.bid.findFirst.mockResolvedValue({
      id: 'bid-1',
      userId: 'other',
      amountCents: 5000,
    });

    const bid = await service.placeBid('auction-1', 'user-1', {
      amountCents: 5500,
    });

    expect(bid).toMatchObject({ amountCents: 5500 });
  });

  it('toma el bloqueo de fila (SELECT ... FOR UPDATE) al registrar la puja', async () => {
    await service.placeBid('auction-1', 'user-1', { amountCents: 4500 });

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
  });

  it('rechaza con OUTBID cuando otra puja se cuela entre el fast path y el lock', async () => {
    // Fast path ve la máxima en 5000 (mín. 5500); la puja de 5500 pasa la fase 1.
    // Bajo el lock, la máxima ya avanzó a 5500 (otra puja ganó la carrera): ahora
    // el mínimo es 6000, así que 5500 se rechaza como OUTBID, no como BID_TOO_LOW.
    prismaMock.bid.findFirst
      .mockResolvedValueOnce({ id: 'b1', userId: 'other', amountCents: 5000 })
      .mockResolvedValueOnce({ id: 'b2', userId: 'other2', amountCents: 5500 });

    const error = await service
      .placeBid('auction-1', 'user-1', { amountCents: 5500 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.OUTBID);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('antisniping: NO extiende el cierre si la puja llega con margen (10 min)', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { ...lockedRow, endsAt: new Date(now + 10 * 60 * 1000) },
    ]);

    await service.placeBid('auction-1', 'user-1', { amountCents: 4500 });

    expect(prismaMock.auction.update).not.toHaveBeenCalled();
    expect(gatewayMock.broadcastExtended).not.toHaveBeenCalled();
  });

  it('antisniping: extiende el cierre a now + 5 min si la puja llega en los últimos minutos', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { ...lockedRow, endsAt: new Date(now + 2 * 60 * 1000) }, // quedan 2 min.
    ]);

    const before = Date.now();
    await service.placeBid('auction-1', 'user-1', { amountCents: 4500 });

    // Se movió el cierre en BD a ~ now + 5 min y se avisó a la room.
    expect(prismaMock.auction.update).toHaveBeenCalledTimes(1);
    const updateCalls = prismaMock.auction.update.mock.calls as Array<
      [{ data: { endsAt: Date } }]
    >;
    const updateArg = updateCalls[0][0];
    const newEndsMs = updateArg.data.endsAt.getTime();
    expect(newEndsMs).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 1000);
    expect(newEndsMs).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);
    expect(gatewayMock.broadcastExtended).toHaveBeenCalledWith(
      'auction-1',
      updateArg.data.endsAt,
    );
  });

  it('rechaza pujar contra uno mismo cuando ya eres el líder', async () => {
    prismaMock.bid.findFirst.mockResolvedValue({
      id: 'bid-1',
      userId: 'user-1',
      amountCents: 5000,
    });

    const error = await service
      .placeBid('auction-1', 'user-1', { amountCents: 6000 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.SELF_OUTBID);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('rechaza pujar tras endsAt (subasta cerrada)', async () => {
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      endsAt: new Date(now - 1000), // cerró hace un segundo.
    });

    const error = await service
      .placeBid('auction-1', 'user-1', { amountCents: 9999 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.AUCTION_CLOSED);
  });

  it('rechaza pujar en una subasta que no está LIVE', async () => {
    prismaMock.auction.findUnique.mockResolvedValue({
      ...liveAuction,
      status: AuctionStatus.SCHEDULED,
    });

    const error = await service
      .placeBid('auction-1', 'user-1', { amountCents: 9999 })
      .catch((e: unknown) => e);

    expect(rejectCode(error)).toBe(BidRejectReason.AUCTION_CLOSED);
  });

  it('exige email verificado para pujar', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    await expect(
      service.placeBid('auction-1', 'user-1', { amountCents: 4500 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('devuelve 404 si la subasta no existe', async () => {
    prismaMock.auction.findUnique.mockResolvedValue(null);

    await expect(
      service.placeBid('missing', 'user-1', { amountCents: 4500 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza con BANNED a un usuario baneado por impago (tarea 07)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
      bannedAt: new Date(),
    });

    const error = await service
      .placeBid('auction-1', 'user-1', { amountCents: 4500 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(rejectCode(error)).toBe(BidRejectReason.BANNED);
    expect(prismaMock.bid.create).not.toHaveBeenCalled();
  });

  it('avisa "superado" al líder anterior una sola vez (tarea 08)', async () => {
    // Había un líder ('other') con 5000; user-1 puja 5500 y lo destrona.
    prismaMock.bid.findFirst.mockResolvedValue({
      id: 'bid-1',
      userId: 'other',
      amountCents: 5000,
    });

    await service.placeBid('auction-1', 'user-1', { amountCents: 5500 });

    // Se avisa SOLO al líder superado, por WS y por email de respaldo.
    expect(gatewayMock.notifyOutbid).toHaveBeenCalledTimes(1);
    expect(gatewayMock.notifyOutbid).toHaveBeenCalledWith('other', {
      auctionId: 'auction-1',
      amountCents: 5500,
    });
    expect(mailMock.sendOutbid).toHaveBeenCalledWith('other', 'auction-1');
  });

  it('no avisa "superado" en la primera puja (no había líder)', async () => {
    await service.placeBid('auction-1', 'user-1', { amountCents: 4500 });

    expect(gatewayMock.notifyOutbid).not.toHaveBeenCalled();
    expect(mailMock.sendOutbid).not.toHaveBeenCalled();
  });

  it('antisniping: al extender el cierre reinicia el guard de "a punto de cerrar"', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      { ...lockedRow, endsAt: new Date(now + 2 * 60 * 1000) }, // quedan 2 min.
    ]);

    await service.placeBid('auction-1', 'user-1', { amountCents: 4500 });

    const updateCalls = prismaMock.auction.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    // El update del antisniping también pone endingSoonNotifiedAt a null (reevaluar).
    expect(updateCalls[0][0].data).toMatchObject({
      endingSoonNotifiedAt: null,
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
        prismaMock.bid.findFirst.mockResolvedValue({
          id: 'bid-1',
          userId: 'user-1',
          amountCents: 5000,
        });

        await expect(
          service.updateAuction('auction-1', { startingPriceCents: 9900 }),
        ).rejects.toMatchObject({
          response: { code: AuctionAdminReason.AUCTION_HAS_BIDS },
        });
      });

      it('deja alargar el cierre de una subasta con pujas, pero no acortarlo', async () => {
        prismaMock.auction.findUnique.mockResolvedValue(liveAuction);
        prismaMock.bid.findFirst.mockResolvedValue({
          id: 'bid-1',
          userId: 'user-1',
          amountCents: 5000,
        });
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
      prismaMock.$queryRaw.mockResolvedValue([dueRow]);
      prismaMock.bid.findFirst.mockResolvedValue({
        id: 'bid-top',
        userId: 'winner-1',
        amountCents: 5000,
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
    };

    it('banea al moroso y reasigna al siguiente pujador (segunda oportunidad)', async () => {
      prismaMock.$queryRaw.mockResolvedValue([unpaidRow]);
      // El siguiente pujador no baneado.
      prismaMock.bid.findFirst.mockResolvedValue({
        id: 'bid-2',
        userId: 'user-2',
        amountCents: 5000,
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
      // El siguiente se busca SOLO entre usuarios no baneados (salta al moroso).
      expect(prismaMock.bid.findFirst).toHaveBeenCalledWith({
        where: { auctionId: 'auction-1', user: { bannedAt: null } },
        orderBy: { amountCents: 'desc' },
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
        },
      });
      expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith('auction-1', {
        winnerMasked: null,
        amountCents: null,
      });
      // Cobro (tarea 09): sin heredero, el pedido PENDING del moroso se cancela y no
      // se crea ninguno nuevo.
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { auctionId: 'auction-1', status: 'PENDING' },
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
