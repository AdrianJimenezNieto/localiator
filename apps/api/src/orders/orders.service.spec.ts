import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderItemType } from '@prisma/client';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderMailService } from '../mail/order-mail.service';

const prismaMock = {
  user: { findUnique: jest.fn() },
  order: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  // findUnique en product/lot: lo usa resolveItemName al crear un pedido de subasta
  // (tarea 09) para el snapshot del nombre.
  product: { update: jest.fn(), findUnique: jest.fn() },
  lot: { update: jest.fn(), findUnique: jest.fn() },
  // auction: el pedido de subasta lee itemType/itemId de ella y, al cobrarse, la
  // pasa a PAID (tarea 09).
  auction: { findUnique: jest.fn(), updateMany: jest.fn() },
  stockReservation: {
    aggregate: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

// Igual que en el resto de specs: la transacción interactiva ejecuta el callback
// con el propio mock como `tx`, de modo que tx.order.create === prismaMock.order.create.
type TxCallback = (tx: typeof prismaMock) => unknown;

const orderMailMock = {
  sendStatusChange: jest.fn(),
  sendOrderConfirmation: jest.fn(),
};

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
        { provide: OrderMailService, useValue: orderMailMock },
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
      const future = new Date(Date.now() + 60_000);
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        lines: [
          { itemType: 'PRODUCT', itemId: 'p1', quantity: 2 },
          { itemType: 'LOT', itemId: 'l1', quantity: 1 },
        ],
        reservations: [{ expiresAt: future }],
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

    it('no descuenta stock si la reserva ya expiró (pago justo al expirar)', async () => {
      const past = new Date(Date.now() - 60_000);
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 2 }],
        reservations: [{ expiresAt: past }],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
      });

      expect(result.outcome).toBe('not_payable');
      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });

    it('pedido de SUBASTA: marca la subasta PAID sin tocar stock ni reservas (tarea 09)', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        auctionId: 'a1', // origen subasta: rama sin reserva.
        stripePaymentIntentId: 'pi_1',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 1 }],
        reservations: [],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
      });

      expect(result.outcome).toBe('paid');
      // La subasta pasa a PAID (solo si sigue CLOSED: guard idempotente).
      expect(prismaMock.auction.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', status: 'CLOSED' },
        data: { status: 'PAID' },
      });
      // NO se descuenta stock ni se borran reservas (el ganador ya tenía el artículo).
      expect(prismaMock.product.update).not.toHaveBeenCalled();
      expect(prismaMock.stockReservation.deleteMany).not.toHaveBeenCalled();
      // El pedido se marca PAID igual que uno normal.
      const updateCalls = prismaMock.order.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(updateCalls[0][0].data).toMatchObject({ status: 'PAID' });
    });
  });

  describe('createAuctionOrder (tarea 09)', () => {
    it('crea un pedido PENDING con la puja como precio, sin reserva de stock', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        itemType: 'PRODUCT',
        itemId: 'p1',
      });
      prismaMock.product.findUnique.mockResolvedValue({ name: 'Cámara' });
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.order.create.mockResolvedValue({ id: 'order-new' });

      const result = await service.createAuctionOrder(prismaMock as never, {
        userId: 'winner-1',
        auctionId: 'a1',
        amountCents: 5000,
      });

      expect(result).toEqual({ id: 'order-new' });
      const createArg = (
        prismaMock.order.create.mock.calls as Array<
          [{ data: Record<string, unknown> }]
        >
      )[0][0];
      // Pedido con auctionId, precio = puja, una línea cantidad 1 y SIN reservations.
      expect(createArg.data).toMatchObject({
        userId: 'winner-1',
        auctionId: 'a1',
        status: 'PENDING',
        totalCents: 5000,
      });
      expect(createArg.data).not.toHaveProperty('reservations');
      const line = (createArg.data.lines as { create: Record<string, unknown> })
        .create;
      expect(line).toMatchObject({
        itemType: 'PRODUCT',
        itemId: 'p1',
        nameSnapshot: 'Cámara',
        unitPriceCents: 5000,
        quantity: 1,
        lineTotalCents: 5000,
      });
    });

    it('segunda oportunidad: cancela el pedido PENDING previo de la misma subasta', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        itemType: 'LOT',
        itemId: 'l1',
      });
      prismaMock.lot.findUnique.mockResolvedValue({ name: 'Lote 12' });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.create.mockResolvedValue({ id: 'order-2' });

      await service.createAuctionOrder(prismaMock as never, {
        userId: 'user-2',
        auctionId: 'a1',
        amountCents: 4000,
      });

      // Antes de crear el nuevo, cancela cualquier PENDING de esa subasta (el moroso).
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { auctionId: 'a1', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });
  });

  describe('getPayableOrder', () => {
    it('un pedido de subasta es pagable sin reserva de stock (tarea 09)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'winner-1',
        status: 'PENDING',
        auctionId: 'a1',
        lines: [],
        reservations: [], // sin reserva: en venta directa daría 409, aquí no.
      });

      const order = await service.getPayableOrder('o1', 'winner-1');

      expect(order.id).toBe('o1');
    });

    it('un pedido normal sin reserva viva no es pagable (409)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'o1',
        userId: 'buyer-1',
        status: 'PENDING',
        auctionId: null,
        lines: [],
        reservations: [],
      });

      await expect(service.getPayableOrder('o1', 'buyer-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('releaseReservation', () => {
    it('libera la reserva y cancela un pedido PENDING', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
      });

      const result = await service.releaseReservation({ orderId: 'o1' });

      expect(result).toEqual({ released: true, orderId: 'o1' });
      expect(prismaMock.stockReservation.deleteMany).toHaveBeenCalledWith({
        where: { orderId: 'o1' },
      });
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: 'CANCELLED' },
      });
    });

    it('es idempotente: no hace nada si el pedido ya no es PENDING', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PAID',
      });

      const result = await service.releaseReservation({ orderId: 'o1' });

      expect(result.released).toBe(false);
      expect(prismaMock.stockReservation.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });
  });

  describe('releaseExpiredReservations', () => {
    it('cancela cada pedido PENDING con reserva expirada', async () => {
      prismaMock.stockReservation.findMany.mockResolvedValue([
        { orderId: 'o1' },
        { orderId: 'o2' },
      ]);
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
      });

      const count = await service.releaseExpiredReservations();

      expect(count).toBe(2);
      expect(prismaMock.order.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('transitionStatus', () => {
    it('acepta una transición legal (PAID → READY_FOR_PICKUP) y envía email', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAID,
      });
      prismaMock.order.update.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.READY_FOR_PICKUP,
      });

      const result = await service.transitionStatus(
        'o1',
        OrderStatus.READY_FOR_PICKUP,
      );

      expect(result.status).toBe(OrderStatus.READY_FOR_PICKUP);
      expect(orderMailMock.sendStatusChange).toHaveBeenCalledWith(
        'o1',
        OrderStatus.READY_FOR_PICKUP,
      );
    });

    it('rechaza con 409 una transición ilegal (CANCELLED → PICKED_UP)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.CANCELLED,
      });

      await expect(
        service.transitionStatus('o1', OrderStatus.PICKED_UP),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('devuelve 404 si el pedido no existe', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);

      await expect(
        service.transitionStatus('nope', OrderStatus.READY_FOR_PICKUP),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
