import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookController } from './webhook.controller';
import { STRIPE_CLIENT } from './stripe.provider';
import { OrdersService } from '../orders/orders.service';
import { InvoicingService } from '../invoicing/invoicing.service';
import { OrderMailService } from '../mail/order-mail.service';
import { AuctionsService } from '../auctions/auctions.service';

const constructEvent = jest.fn();
const stripeMock = { webhooks: { constructEvent } };

const ordersMock = {
  confirmOrderPaid: jest.fn(),
  releaseReservation: jest.fn(),
  registerRefund: jest.fn(),
  openDispute: jest.fn(),
  resolveDispute: jest.fn(),
};

const invoicingMock = { generateForOrder: jest.fn() };
const orderMailMock = {
  sendOrderConfirmation: jest.fn(),
  sendRefundNotice: jest.fn(),
  sendDisputeAlert: jest.fn(),
};
// Tarea 15: si el cobro de una venta directa agota el artículo de una subasta, el
// webhook avisa a los pujadores (OrdersService cancela pero no puede notificar).
const auctionsMock = { notifyAuctionCancelled: jest.fn() };

const configMock = {
  get: jest.fn((key: string) =>
    key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined,
  ),
};

// Request mínimo con rawBody y cabecera de firma.
function reqWith(raw: Buffer | undefined): RawBodyRequest<Request> {
  return { rawBody: raw } as RawBodyRequest<Request>;
}

describe('WebhookController', () => {
  let controller: WebhookController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: STRIPE_CLIENT, useValue: stripeMock },
        { provide: OrdersService, useValue: ordersMock },
        { provide: InvoicingService, useValue: invoicingMock },
        { provide: OrderMailService, useValue: orderMailMock },
        { provide: AuctionsService, useValue: auctionsMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    controller = moduleRef.get(WebhookController);
  });

  it('rechaza con 400 si la firma no es válida', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(
      controller.handle(reqWith(Buffer.from('{}')), 'sig'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ordersMock.confirmOrderPaid).not.toHaveBeenCalled();
  });

  it('confirma el pedido en checkout.session.completed', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          payment_intent: 'pi_123',
          payment_status: 'paid',
          metadata: { orderId: 'o1' },
        },
      },
    });
    ordersMock.confirmOrderPaid.mockResolvedValue({
      outcome: 'paid',
      orderId: 'o1',
    });

    const result = await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(result).toEqual({ received: true });
    expect(ordersMock.confirmOrderPaid).toHaveBeenCalledWith({
      paymentIntentId: 'pi_123',
      orderId: 'o1',
    });
    // Sin subastas afectadas no se avisa a nadie.
    expect(auctionsMock.notifyAuctionCancelled).not.toHaveBeenCalled();
  });

  // Tarea 15: la venta directa agotó el artículo y su subasta se canceló dentro de
  // la transacción del cobro. Avisar a los pujadores es cosa de aquí: OrdersService
  // no puede depender de AuctionsService (AuctionsModule ya importa OrdersModule).
  it('avisa a los pujadores si el cobro canceló una subasta por falta de stock', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          payment_intent: 'pi_123',
          payment_status: 'paid',
          metadata: { orderId: 'o1' },
        },
      },
    });
    ordersMock.confirmOrderPaid.mockResolvedValue({
      outcome: 'paid',
      orderId: 'o1',
      cancelledAuctionIds: ['a1', 'a2'],
    });

    await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(auctionsMock.notifyAuctionCancelled).toHaveBeenCalledWith('a1');
    expect(auctionsMock.notifyAuctionCancelled).toHaveBeenCalledWith('a2');
  });

  it('libera la reserva en payment_intent.payment_failed', async () => {
    constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      livemode: false,
      data: { object: { id: 'pi_123', metadata: { orderId: 'o1' } } },
    });
    ordersMock.releaseReservation.mockResolvedValue({
      released: true,
      orderId: 'o1',
    });

    const result = await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(result).toEqual({ received: true });
    expect(ordersMock.releaseReservation).toHaveBeenCalledWith({
      paymentIntentId: 'pi_123',
      orderId: 'o1',
    });
  });

  it('ignora eventos no manejados devolviendo 200', async () => {
    constructEvent.mockReturnValue({
      type: 'payment_intent.created',
      livemode: false,
      data: { object: {} },
    });

    const result = await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(result).toEqual({ received: true });
    expect(ordersMock.confirmOrderPaid).not.toHaveBeenCalled();
  });

  // Regresión de seguridad: `checkout.session.completed` NO implica cobro. Con
  // métodos asíncronos (SEPA, transferencia, Klarna) la sesión se completa con
  // payment_status 'unpaid' y el dinero puede no llegar nunca.
  it('NO confirma el pedido si la sesión se completó sin pagar', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          payment_intent: 'pi_123',
          payment_status: 'unpaid',
          metadata: { orderId: 'o1' },
        },
      },
    });

    const result = await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(result).toEqual({ received: true });
    expect(ordersMock.confirmOrderPaid).not.toHaveBeenCalled();
  });

  // Firma válida pero del modo equivocado (claves de test en producción o al
  // revés): se ignora en vez de confirmar pedidos con dinero de juguete.
  it('ignora un evento cuyo livemode no casa con el entorno', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      livemode: true, // NODE_ENV del test no es 'production'
      data: {
        object: {
          payment_intent: 'pi_123',
          payment_status: 'paid',
          metadata: { orderId: 'o1' },
        },
      },
    });

    const result = await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(result).toEqual({ received: true });
    expect(ordersMock.confirmOrderPaid).not.toHaveBeenCalled();
  });

  // El importe cobrado se pasa al servicio para que lo contraste con el pedido.
  it('traslada importe y moneda de la sesión al servicio', async () => {
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          payment_intent: 'pi_123',
          payment_status: 'paid',
          amount_total: 12_345,
          currency: 'eur',
          metadata: { orderId: 'o1' },
        },
      },
    });
    ordersMock.confirmOrderPaid.mockResolvedValue({
      outcome: 'amount_mismatch',
      orderId: 'o1',
      expectedCents: 10_000,
      receivedCents: 12_345,
    });

    await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(ordersMock.confirmOrderPaid).toHaveBeenCalledWith({
      paymentIntentId: 'pi_123',
      orderId: 'o1',
      amountPaidCents: 12_345,
      currency: 'eur',
    });
    // Un desajuste no dispara factura ni email de confirmación.
    expect(invoicingMock.generateForOrder).not.toHaveBeenCalled();
    expect(orderMailMock.sendOrderConfirmation).not.toHaveBeenCalled();
  });

  describe('reembolsos y disputas', () => {
    it('registra un reembolso con el ACUMULADO devuelto y avisa al cliente', async () => {
      constructEvent.mockReturnValue({
        type: 'charge.refunded',
        livemode: false,
        data: {
          object: {
            payment_intent: 'pi_123',
            amount_refunded: 10_000,
            metadata: { orderId: 'o1' },
          },
        },
      });
      ordersMock.registerRefund.mockResolvedValue({
        outcome: 'refunded',
        orderId: 'o1',
        refundedCents: 10_000,
        totalCents: 10_000,
      });

      await controller.handle(reqWith(Buffer.from('{}')), 'sig');

      expect(ordersMock.registerRefund).toHaveBeenCalledWith({
        paymentIntentId: 'pi_123',
        orderId: 'o1',
        amountRefundedCents: 10_000,
      });
      expect(orderMailMock.sendRefundNotice).toHaveBeenCalledWith(
        'o1',
        10_000,
        true,
      );
    });

    it('abre la disputa y alerta al admin', async () => {
      constructEvent.mockReturnValue({
        type: 'charge.dispute.created',
        livemode: false,
        data: {
          object: {
            payment_intent: 'pi_123',
            metadata: { orderId: 'o1' },
          },
        },
      });
      ordersMock.openDispute.mockResolvedValue({
        outcome: 'disputed',
        orderId: 'o1',
        previousStatus: 'PAID',
        totalCents: 10_000,
        customerEmail: 'c@x.dev',
      });

      await controller.handle(reqWith(Buffer.from('{}')), 'sig');

      expect(orderMailMock.sendDisputeAlert).toHaveBeenCalledWith({
        orderId: 'o1',
        totalCents: 10_000,
        customerEmail: 'c@x.dev',
      });
    });

    // Solo 'won' conserva el dinero; cualquier otro desenlace es pérdida.
    it('traduce el veredicto de la disputa a perdida/ganada', async () => {
      ordersMock.resolveDispute.mockResolvedValue({
        outcome: 'won',
        orderId: 'o1',
        restoredStatus: 'PAID',
      });

      constructEvent.mockReturnValue({
        type: 'charge.dispute.closed',
        livemode: false,
        data: {
          object: { payment_intent: 'pi_123', status: 'won', metadata: {} },
        },
      });
      await controller.handle(reqWith(Buffer.from('{}')), 'sig');
      expect(ordersMock.resolveDispute).toHaveBeenCalledWith(
        expect.objectContaining({ lost: false }),
      );

      constructEvent.mockReturnValue({
        type: 'charge.dispute.closed',
        livemode: false,
        data: {
          object: { payment_intent: 'pi_123', status: 'lost', metadata: {} },
        },
      });
      await controller.handle(reqWith(Buffer.from('{}')), 'sig');
      expect(ordersMock.resolveDispute).toHaveBeenLastCalledWith(
        expect.objectContaining({ lost: true }),
      );
    });
  });

  it('rechaza con 400 si falta el cuerpo sin parsear', async () => {
    await expect(
      controller.handle(reqWith(undefined), 'sig'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
