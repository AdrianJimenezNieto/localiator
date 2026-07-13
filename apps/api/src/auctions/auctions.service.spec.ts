import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuctionStatus } from '@prisma/client';
import { AuctionsService, BidRejectReason } from './auctions.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  user: { findUnique: jest.fn() },
  auction: { findUnique: jest.fn() },
  bid: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const verifiedUser = { emailVerifiedAt: new Date() };

// Subasta LIVE base: empezó hace una hora, cierra dentro de una hora. Cada test
// la ajusta con un spread si necesita otro estado/ventana.
const now = Date.now();
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuctionsService,
        { provide: PrismaService, useValue: prismaMock },
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
});
