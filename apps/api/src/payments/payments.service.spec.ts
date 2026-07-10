import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { STRIPE_CLIENT } from './stripe.provider';
import { OrdersService } from '../orders/orders.service';

const sessionsCreate = jest.fn();
const stripeMock = {
  checkout: { sessions: { create: sessionsCreate } },
};

const ordersMock = {
  getPayableOrder: jest.fn(),
  setPaymentIntent: jest.fn(),
};

const configMock = {
  get: jest.fn((key: string) =>
    key === 'APP_URL' ? 'http://localhost:5173' : undefined,
  ),
};

const payableOrder = {
  id: 'o1',
  userId: 'u1',
  currency: 'eur',
  totalCents: 3400,
  lines: [
    {
      nameSnapshot: 'Taladro',
      unitPriceCents: 1700,
      quantity: 2,
    },
  ],
};

async function buildService(stripe: unknown) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PaymentsService,
      { provide: STRIPE_CLIENT, useValue: stripe },
      { provide: OrdersService, useValue: ordersMock },
      { provide: ConfigService, useValue: configMock },
    ],
  }).compile();
  return moduleRef.get(PaymentsService);
}

describe('PaymentsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ordersMock.getPayableOrder.mockResolvedValue(payableOrder);
  });

  it('crea la sesión con el importe del pedido y enlaza el PaymentIntent', async () => {
    sessionsCreate.mockResolvedValue({
      id: 'cs_1',
      payment_intent: 'pi_123',
      url: 'https://checkout.stripe.com/pay/cs_1',
    });
    const service = await buildService(stripeMock);

    const result = await service.createCheckoutSession('o1', 'u1');

    expect(result.url).toBe('https://checkout.stripe.com/pay/cs_1');
    const calls = sessionsCreate.mock.calls as unknown as Array<
      [
        {
          line_items: {
            price_data: { unit_amount: number };
            quantity: number;
          }[];
          metadata: { orderId: string };
        },
      ]
    >;
    const params = calls[0][0];
    // Importe desde BD: 1700 céntimos x 2 unidades.
    expect(params.line_items[0].price_data.unit_amount).toBe(1700);
    expect(params.line_items[0].quantity).toBe(2);
    expect(params.metadata.orderId).toBe('o1');
    expect(ordersMock.setPaymentIntent).toHaveBeenCalledWith('o1', 'pi_123');
  });

  it('propaga 404 si el pedido es ajeno o no existe', async () => {
    ordersMock.getPayableOrder.mockRejectedValue(new NotFoundException());
    const service = await buildService(stripeMock);

    await expect(
      service.createCheckoutSession('o1', 'otro'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('propaga 409 si el pedido no es pagable (pagado o reserva expirada)', async () => {
    ordersMock.getPayableOrder.mockRejectedValue(new ConflictException());
    const service = await buildService(stripeMock);

    await expect(
      service.createCheckoutSession('o1', 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('devuelve 503 si Stripe no está configurado', async () => {
    const service = await buildService(null);

    await expect(
      service.createCheckoutSession('o1', 'u1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
