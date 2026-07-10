import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookController } from './webhook.controller';
import { STRIPE_CLIENT } from './stripe.provider';
import { OrdersService } from '../orders/orders.service';
import { InvoicingService } from '../invoicing/invoicing.service';

const constructEvent = jest.fn();
const stripeMock = { webhooks: { constructEvent } };

const ordersMock = {
  confirmOrderPaid: jest.fn(),
  releaseReservation: jest.fn(),
};

const invoicingMock = { generateForOrder: jest.fn() };

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
      data: {
        object: {
          payment_intent: 'pi_123',
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
  });

  it('libera la reserva en payment_intent.payment_failed', async () => {
    constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
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
      data: { object: {} },
    });

    const result = await controller.handle(reqWith(Buffer.from('{}')), 'sig');

    expect(result).toEqual({ received: true });
    expect(ordersMock.confirmOrderPaid).not.toHaveBeenCalled();
  });

  it('rechaza con 400 si falta el cuerpo sin parsear', async () => {
    await expect(
      controller.handle(reqWith(undefined), 'sig'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
