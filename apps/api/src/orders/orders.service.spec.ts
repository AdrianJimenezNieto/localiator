import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderItemType } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  user: { findUnique: jest.fn() },
  order: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  product: { update: jest.fn() },
  lot: { update: jest.fn() },
  stockReservation: {
    aggregate: jest.fn(),
    deleteMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

// Igual que en el resto de specs: la transacción interactiva ejecuta el callback
// con el propio mock como `tx`, de modo que tx.order.create === prismaMock.order.create.
type TxCallback = (tx: typeof prismaMock) => unknown;

const verifiedUser = { emailVerifiedAt: new Date() };

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: TxCallback) =>
      cb(prismaMock),
    );
    // Por defecto: usuario verificado, sin pedidos PENDING previos, sin reservas.
    prismaMock.user.findUnique.mockResolvedValue(verifiedUser);
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.stockReservation.aggregate.mockResolvedValue({
      _sum: { quantity: 0 },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('crea el pedido y reserva stock cuando hay disponible', async () => {
    // Artículo con stock 5 y precio con descuento aplicado (2000 − 300 = 1700).
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 'p1',
        stock: 5,
        name: 'Taladro',
        priceCents: 2000,
        discountCents: 300,
      },
    ]);
    prismaMock.order.create.mockResolvedValue({
      id: 'o1',
      status: 'PENDING',
      totalCents: 3400,
      currency: 'eur',
      createdAt: new Date(),
      lines: [
        {
          itemType: 'PRODUCT',
          itemId: 'p1',
          nameSnapshot: 'Taladro',
          unitPriceCents: 1700,
          quantity: 2,
          lineTotalCents: 3400,
        },
      ],
    });

    const result = await service.createOrder('u1', {
      items: [{ itemType: OrderItemType.PRODUCT, itemId: 'p1', quantity: 2 }],
    });

    // El total lo fija el servidor desde BD: 1700 * 2.
    expect(result.totalCents).toBe(3400);
    const calls = prismaMock.order.create.mock.calls as unknown as Array<
      [
        {
          data: {
            totalCents: number;
            lines: { create: { unitPriceCents: number }[] };
            reservations: { create: { quantity: number }[] };
          };
        },
      ]
    >;
    const createArg = calls[0][0];
    expect(createArg.data.totalCents).toBe(3400);
    expect(createArg.data.lines.create[0].unitPriceCents).toBe(1700);
    expect(createArg.data.reservations.create[0].quantity).toBe(2);
  });

  it('rechaza con 409 si la cantidad supera el disponible (stock − reservas vivas)', async () => {
    // Stock 1 pero ya hay 1 reservado vivo → disponible 0.
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 'p1',
        stock: 1,
        name: 'Último',
        priceCents: 1000,
        discountCents: 0,
      },
    ]);
    prismaMock.stockReservation.aggregate.mockResolvedValue({
      _sum: { quantity: 1 },
    });

    await expect(
      service.createOrder('u1', {
        items: [{ itemType: OrderItemType.PRODUCT, itemId: 'p1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el artículo no existe', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]); // FOR UPDATE no encuentra fila.

    await expect(
      service.createOrder('u1', {
        items: [
          { itemType: OrderItemType.PRODUCT, itemId: 'nope', quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('prohíbe (403) crear pedido si el email no está verificado', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ emailVerifiedAt: null });

    await expect(
      service.createOrder('u1', {
        items: [{ itemType: OrderItemType.PRODUCT, itemId: 'p1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('cancela los pedidos PENDING previos del usuario antes de crear el nuevo', async () => {
    prismaMock.order.findMany.mockResolvedValue([{ id: 'old1' }]);
    prismaMock.$queryRaw.mockResolvedValue([
      { id: 'p1', stock: 5, name: 'X', priceCents: 1000, discountCents: 0 },
    ]);
    prismaMock.order.create.mockResolvedValue({
      id: 'o2',
      status: 'PENDING',
      totalCents: 1000,
      currency: 'eur',
      createdAt: new Date(),
      lines: [],
    });

    await service.createOrder('u1', {
      items: [{ itemType: OrderItemType.PRODUCT, itemId: 'p1', quantity: 1 }],
    });

    expect(prismaMock.stockReservation.deleteMany).toHaveBeenCalledWith({
      where: { orderId: { in: ['old1'] } },
    });
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old1'] } },
      data: { status: 'CANCELLED' },
    });
  });

  describe('confirmOrderPaid', () => {
    it('descuenta stock, consume reservas y marca PAID un pedido PENDING', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        lines: [
          { itemType: 'PRODUCT', itemId: 'p1', quantity: 2 },
          { itemType: 'LOT', itemId: 'l1', quantity: 1 },
        ],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
      });

      expect(result.outcome).toBe('paid');
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { decrement: 2 } },
      });
      expect(prismaMock.lot.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { stock: { decrement: 1 } },
      });
      expect(prismaMock.stockReservation.deleteMany).toHaveBeenCalledWith({
        where: { orderId: 'o1' },
      });
      const updateCalls = prismaMock.order.update.mock
        .calls as unknown as Array<[{ data: { status: string } }]>;
      expect(updateCalls[0][0].data.status).toBe('PAID');
    });

    it('es idempotente: un evento duplicado sobre un pedido ya PAID no descuenta stock', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PAID',
        stripePaymentIntentId: 'pi_1',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 2 }],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
      });

      expect(result.outcome).toBe('already_paid');
      expect(prismaMock.product.update).not.toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('no descuenta stock si el pedido ya no es PENDING (carrera pago/expiración)', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'CANCELLED',
        stripePaymentIntentId: 'pi_1',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 2 }],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
      });

      expect(result.outcome).toBe('not_payable');
      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });
  });
});
