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
  // pasa a PAID (tarea 09). findMany: buscar las subastas vivas de un artículo que
  // se acaba de agotar en una venta directa, para cancelarlas (tarea 15).
  auction: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
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

// Primer `order.update` registrado, tipado a mano: el mock de Prisma es `any` y
// leer `.mock.calls[0][0]` en crudo dispara las reglas de no-unsafe del linter.
function firstUpdate<T>(): { data: T } {
  return (
    prismaMock.order.update.mock.calls as unknown as Array<[{ data: T }]>
  )[0][0];
}

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

  // Regresión (tarea 15). Este bug era real y estaba en main: un pedido de subasta
  // vive PENDING hasta 48 h, así que al entrar al checkout de OTRA cosa se cancelaba
  // solo, y a las 48 h el cron de impago BANEABA al ganador por no pagar algo que el
  // sistema le había cancelado. La intención de cancelPriorPending es "que nadie
  // acapare stock reentrando al checkout", y un pedido de subasta no es eso.
  it('NO cancela el pedido de subasta del usuario al crear un pedido normal', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
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

    // La búsqueda de pedidos previos EXCLUYE los de subasta.
    const [findCall] = prismaMock.order.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findCall[0].where).toMatchObject({
      userId: 'u1',
      status: 'PENDING',
      auctionId: null,
    });
  });

  describe('reembolsos', () => {
    const paidOrder = (extra: Record<string, unknown> = {}) => ({
      id: 'o1',
      userId: 'u1',
      status: 'PAID',
      stripePaymentIntentId: 'pi_1',
      totalCents: 10_000,
      refundedCents: 0,
      refundedAt: null,
      lines: [],
      reservations: [],
      ...extra,
    });

    it('un reembolso TOTAL pasa el pedido a REFUNDED', async () => {
      prismaMock.order.findFirst.mockResolvedValue(paidOrder());

      const result = await service.registerRefund({
        paymentIntentId: 'pi_1',
        amountRefundedCents: 10_000,
      });

      expect(result.outcome).toBe('refunded');
      const call = firstUpdate<{ status?: string; refundedCents: number }>();
      expect(call.data.status).toBe('REFUNDED');
      expect(call.data.refundedCents).toBe(10_000);
    });

    // Devolver un artículo de tres no anula la venta: el pedido sigue vivo y el
    // cliente aún tiene que recoger el resto.
    it('un reembolso PARCIAL apunta el importe pero NO cambia el estado', async () => {
      prismaMock.order.findFirst.mockResolvedValue(paidOrder());

      const result = await service.registerRefund({
        paymentIntentId: 'pi_1',
        amountRefundedCents: 2_500,
      });

      expect(result.outcome).toBe('partially_refunded');
      const call = firstUpdate<{ status?: string; refundedCents: number }>();
      expect(call.data.status).toBeUndefined();
      expect(call.data.refundedCents).toBe(2_500);
    });

    // Stripe manda el ACUMULADO devuelto, no el delta: reprocesar el evento debe
    // dejar el mismo valor, nunca sumar dos veces.
    it('es idempotente ante el mismo evento repetido', async () => {
      prismaMock.order.findFirst.mockResolvedValue(
        paidOrder({ refundedCents: 2_500 }),
      );

      const result = await service.registerRefund({
        paymentIntentId: 'pi_1',
        amountRefundedCents: 2_500,
      });

      expect(result.outcome).toBe('noop');
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('NO repone stock: el artículo puede estar ya en manos del cliente', async () => {
      prismaMock.order.findFirst.mockResolvedValue(
        paidOrder({
          lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 2 }],
        }),
      );

      await service.registerRefund({
        paymentIntentId: 'pi_1',
        amountRefundedCents: 10_000,
      });

      expect(prismaMock.product.update).not.toHaveBeenCalled();
      expect(prismaMock.lot.update).not.toHaveBeenCalled();
    });

    it('un pedido en disputa se queda DISPUTED aunque se reembolse', async () => {
      prismaMock.order.findFirst.mockResolvedValue(
        paidOrder({ status: 'DISPUTED' }),
      );

      await service.registerRefund({
        paymentIntentId: 'pi_1',
        amountRefundedCents: 10_000,
      });

      const call = firstUpdate<{ status?: string }>();
      expect(call.data.status).toBeUndefined();
    });
  });

  describe('disputas', () => {
    const disputable = (extra: Record<string, unknown> = {}) => ({
      id: 'o1',
      userId: 'u1',
      status: 'READY_FOR_PICKUP',
      stripePaymentIntentId: 'pi_1',
      totalCents: 10_000,
      refundedCents: 0,
      refundedAt: null,
      preDisputeStatus: null,
      lines: [],
      reservations: [],
      ...extra,
    });

    it('abre la disputa guardando el estado previo', async () => {
      prismaMock.order.findFirst.mockResolvedValue(disputable());
      prismaMock.user.findUnique.mockResolvedValue({ email: 'c@x.dev' });

      const result = await service.openDispute({ paymentIntentId: 'pi_1' });

      expect(result.outcome).toBe('disputed');
      expect(result.previousStatus).toBe('READY_FOR_PICKUP');
      expect(result.customerEmail).toBe('c@x.dev');
      const call = firstUpdate<{ status: string; preDisputeStatus: string }>();
      expect(call.data.status).toBe('DISPUTED');
      expect(call.data.preDisputeStatus).toBe('READY_FOR_PICKUP');
    });

    it('es idempotente si la disputa ya estaba abierta', async () => {
      prismaMock.order.findFirst.mockResolvedValue(
        disputable({ status: 'DISPUTED' }),
      );

      const result = await service.openDispute({ paymentIntentId: 'pi_1' });

      expect(result.outcome).toBe('already_disputed');
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    // Lo importante de guardar preDisputeStatus: ganar una disputa sobre un pedido
    // YA RECOGIDO no debe devolverlo a la cola del almacén.
    it('al ganar, restaura el estado previo en vez de volver a PAID', async () => {
      prismaMock.order.findFirst.mockResolvedValue(
        disputable({ status: 'DISPUTED', preDisputeStatus: 'PICKED_UP' }),
      );

      const result = await service.resolveDispute({
        paymentIntentId: 'pi_1',
        lost: false,
      });

      expect(result.outcome).toBe('won');
      expect(result.restoredStatus).toBe('PICKED_UP');
      const call = firstUpdate<{ status: string; preDisputeStatus: null }>();
      expect(call.data.status).toBe('PICKED_UP');
      expect(call.data.preDisputeStatus).toBeNull();
    });

    it('al perder, el pedido queda REFUNDED por el importe completo', async () => {
      prismaMock.order.findFirst.mockResolvedValue(
        disputable({ status: 'DISPUTED', preDisputeStatus: 'PAID' }),
      );

      const result = await service.resolveDispute({
        paymentIntentId: 'pi_1',
        lost: true,
      });

      expect(result.outcome).toBe('lost');
      const call = firstUpdate<{ status: string; refundedCents: number }>();
      expect(call.data.status).toBe('REFUNDED');
      expect(call.data.refundedCents).toBe(10_000);
    });

    it('cerrar una disputa que no está abierta no hace nada', async () => {
      prismaMock.order.findFirst.mockResolvedValue(disputable());

      const result = await service.resolveDispute({
        paymentIntentId: 'pi_1',
        lost: true,
      });

      expect(result.outcome).toBe('not_disputed');
      expect(prismaMock.order.update).not.toHaveBeenCalled();
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

    // Regresión de seguridad: antes se marcaba PAID sin mirar cuánto se había
    // cobrado, así que un cobro por menos importe entregaba la mercancía igual.
    it('rechaza el cobro si el importe no coincide con el total del pedido', async () => {
      const future = new Date(Date.now() + 60_000);
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        totalCents: 10_000,
        currency: 'eur',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 2 }],
        reservations: [{ expiresAt: future }],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
        amountPaidCents: 100, // un euro por un pedido de cien
        currency: 'eur',
      });

      expect(result.outcome).toBe('amount_mismatch');
      expect(result.expectedCents).toBe(10_000);
      expect(result.receivedCents).toBe(100);
      // Lo importante: no se toca ni el stock ni el estado del pedido.
      expect(prismaMock.product.update).not.toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('rechaza el cobro si la moneda no coincide', async () => {
      const future = new Date(Date.now() + 60_000);
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        totalCents: 10_000,
        currency: 'eur',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 2 }],
        reservations: [{ expiresAt: future }],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
        amountPaidCents: 10_000,
        currency: 'usd',
      });

      expect(result.outcome).toBe('amount_mismatch');
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('acepta el cobro cuando importe y moneda cuadran', async () => {
      const future = new Date(Date.now() + 60_000);
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_1',
        totalCents: 10_000,
        currency: 'eur',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 2 }],
        reservations: [{ expiresAt: future }],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
        amountPaidCents: 10_000,
        currency: 'EUR', // Stripe la manda en minúsculas; comparamos sin distinguir
      });

      expect(result.outcome).toBe('paid');
    });

    // Regresión: doble clic en "Pagar" → dos sesiones. El pedido guarda el PI de la
    // segunda, pero el cliente paga con la primera. Antes ese cobro se perdía
    // ('not_found'); ahora el orderId de la metadata lo rescata.
    it('encuentra el pedido por orderId si el PaymentIntent del evento ya no es el guardado', async () => {
      const future = new Date(Date.now() + 60_000);
      prismaMock.order.findFirst.mockResolvedValue(null); // el PI viejo no está en BD
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        stripePaymentIntentId: 'pi_2', // el de la segunda sesión
        totalCents: 10_000,
        currency: 'eur',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 1 }],
        reservations: [{ expiresAt: future }],
      });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1', // se pagó con la primera sesión
        orderId: 'o1',
        amountPaidCents: 10_000,
        currency: 'eur',
      });

      expect(result.outcome).toBe('paid');
      expect(result.orderId).toBe('o1');
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

    // Tarea 15: el pedido de subasta SÍ descuenta stock. Antes no lo hacía y un
    // artículo subastado, ganado y pagado se quedaba en el catálogo, listo para
    // venderse otra vez.
    it('pedido de SUBASTA: marca la subasta PAID y descuenta stock (tarea 15)', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        auctionId: 'a1',
        stripePaymentIntentId: 'pi_1',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 1 }],
        // Desde la tarea 15 el pedido del ganador lleva reserva, que vence con su
        // plazo de pago (48 h).
        reservations: [{ expiresAt: new Date(Date.now() + 48 * 3600_000) }],
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
      // El artículo sale del inventario y su reserva se consume.
      expect(prismaMock.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { decrement: 1 } },
      });
      expect(prismaMock.stockReservation.deleteMany).toHaveBeenCalledWith({
        where: { orderId: 'o1' },
      });
      const updateCalls = prismaMock.order.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(updateCalls[0][0].data).toMatchObject({ status: 'PAID' });
    });

    // La regla de negocio de la tarea 15: gana quien paga primero.
    it('venta directa que AGOTA el artículo cancela su subasta viva (tarea 15)', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        auctionId: null, // venta directa.
        stripePaymentIntentId: 'pi_1',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 1 }],
        reservations: [{ expiresAt: new Date(Date.now() + 60_000) }],
      });
      // Tras descontar, el artículo se queda sin stock.
      prismaMock.product.findUnique.mockResolvedValue({ stock: 0 });
      prismaMock.auction.findMany.mockResolvedValue([{ id: 'a1' }]);

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
      });

      expect(result.outcome).toBe('paid');
      expect(prismaMock.auction.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1'] } },
        data: { status: 'CANCELLED' },
      });
      // Se devuelven los ids para que el llamador avise a los pujadores: este
      // servicio no puede depender de AuctionsService (ciclo de módulos).
      expect(result.cancelledAuctionIds).toEqual(['a1']);
    });

    // Con stock de sobra, vender una unidad no puede matar la subasta: todavía
    // quedan artículos que entregar.
    it('venta directa que NO agota el artículo respeta su subasta (tarea 15)', async () => {
      prismaMock.order.findFirst.mockResolvedValue({
        id: 'o1',
        status: 'PENDING',
        auctionId: null,
        stripePaymentIntentId: 'pi_1',
        lines: [{ itemType: 'PRODUCT', itemId: 'p1', quantity: 1 }],
        reservations: [{ expiresAt: new Date(Date.now() + 60_000) }],
      });
      prismaMock.product.findUnique.mockResolvedValue({ stock: 4 });

      const result = await service.confirmOrderPaid({
        paymentIntentId: 'pi_1',
      });

      expect(result.outcome).toBe('paid');
      expect(prismaMock.auction.findMany).not.toHaveBeenCalled();
      expect(result.cancelledAuctionIds).toEqual([]);
    });
  });

  describe('createAuctionOrder (tarea 09)', () => {
    it('crea un pedido PENDING con la puja como precio y reserva el artículo', async () => {
      prismaMock.auction.findUnique.mockResolvedValue({
        itemType: 'PRODUCT',
        itemId: 'p1',
      });
      prismaMock.product.findUnique.mockResolvedValue({ name: 'Cámara' });
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.order.create.mockResolvedValue({ id: 'order-new' });

      const dueAt = new Date(Date.now() + 48 * 3600_000);
      const result = await service.createAuctionOrder(prismaMock as never, {
        userId: 'winner-1',
        auctionId: 'a1',
        amountCents: 5000,
        paymentDueAt: dueAt,
      });

      expect(result).toEqual({ id: 'order-new' });
      const createArg = (
        prismaMock.order.create.mock.calls as Array<
          [{ data: Record<string, unknown> }]
        >
      )[0][0];
      // Pedido con auctionId, precio = puja y una línea cantidad 1.
      expect(createArg.data).toMatchObject({
        userId: 'winner-1',
        auctionId: 'a1',
        status: 'PENDING',
        totalCents: 5000,
      });
      // Tarea 15: reserva el artículo hasta que venza el plazo de pago del ganador,
      // para que la venta directa no pueda llevárselo mientras paga. La caducidad es
      // su paymentDueAt (48 h), NO el TTL de 15 min de la venta directa.
      const reservation = (
        createArg.data.reservations as { create: Record<string, unknown> }
      ).create;
      expect(reservation).toMatchObject({
        itemType: 'PRODUCT',
        itemId: 'p1',
        quantity: 1,
        expiresAt: dueAt,
      });
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
      prismaMock.order.findMany.mockResolvedValue([{ id: 'order-moroso' }]);
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.create.mockResolvedValue({ id: 'order-2' });

      await service.createAuctionOrder(prismaMock as never, {
        userId: 'user-2',
        auctionId: 'a1',
        amountCents: 4000,
        paymentDueAt: new Date(Date.now() + 48 * 3600_000),
      });

      // Antes de crear el nuevo, cancela cualquier PENDING de esa subasta (el moroso).
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['order-moroso'] } },
        data: { status: 'CANCELLED' },
      });
      // Y BORRA su reserva (tarea 15): liveReservedQuantity cuenta por expiresAt sin
      // mirar el estado del pedido, así que una reserva huérfana bloquearía el stock
      // 48 h aunque su pedido esté cancelado.
      expect(prismaMock.stockReservation.deleteMany).toHaveBeenCalledWith({
        where: { orderId: { in: ['order-moroso'] } },
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
