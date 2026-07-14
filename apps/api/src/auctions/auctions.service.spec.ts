import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuctionStatus } from '@prisma/client';
import { AuctionsService, BidRejectReason } from './auctions.service';
import { AuctionsGateway } from './auctions.gateway';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  user: { findUnique: jest.fn() },
  auction: { findUnique: jest.fn(), update: jest.fn() },
  bid: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

// El servicio emite a la room tras registrar la puja (punto único de emisión) y,
// si el antisniping mueve el cierre, avisa con broadcastExtended; al cerrar,
// broadcastClosed.
const gatewayMock = {
  broadcastBidAccepted: jest.fn(),
  broadcastExtended: jest.fn(),
  broadcastClosed: jest.fn(),
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

const verifiedUser = { emailVerifiedAt: new Date() };

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
      expect(prismaMock.auction.update).toHaveBeenCalledWith({
        where: { id: 'auction-1' },
        data: {
          status: AuctionStatus.CLOSED,
          winnerUserId: 'winner-1',
          winningBidId: 'bid-top',
        },
      });
      expect(gatewayMock.broadcastClosed).toHaveBeenCalledWith(
        'auction-1',
        expect.objectContaining({ amountCents: 5000 }),
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
});
