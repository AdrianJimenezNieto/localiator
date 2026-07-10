import { Test } from '@nestjs/testing';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { STRIPE_CLIENT } from './stripe.provider';

const prismaMock = {
  order: { findMany: jest.fn() },
};

const list = jest.fn();
const stripeMock = { paymentIntents: { list } };

// Una página única de Stripe (has_more:false) con los intents dados.
function stripePage(intents: unknown[]) {
  return { data: intents, has_more: false };
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: STRIPE_CLIENT, useValue: stripeMock },
      ],
    }).compile();
    service = moduleRef.get(ReconciliationService);
  });

  it('cuadra cuando pedido PAID y cobro de Stripe coinciden', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { id: 'o1', totalCents: 3400, stripePaymentIntentId: 'pi_1' },
    ]);
    list.mockResolvedValue(
      stripePage([{ id: 'pi_1', amount: 3400, status: 'succeeded' }]),
    );

    const report = await service.reconcile({});

    expect(report.matched).toBe(1);
    expect(report.discrepancies).toHaveLength(0);
  });

  it('detecta un cobro de Stripe sin pedido PAID', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    list.mockResolvedValue(
      stripePage([{ id: 'pi_x', amount: 5000, status: 'succeeded' }]),
    );

    const report = await service.reconcile({});

    expect(report.matched).toBe(0);
    expect(report.discrepancies).toEqual([
      {
        type: 'stripe_without_order',
        paymentIntentId: 'pi_x',
        stripeAmountCents: 5000,
      },
    ]);
  });

  it('detecta un importe distinto entre pedido y cobro', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { id: 'o1', totalCents: 3400, stripePaymentIntentId: 'pi_1' },
    ]);
    list.mockResolvedValue(
      stripePage([{ id: 'pi_1', amount: 9999, status: 'succeeded' }]),
    );

    const report = await service.reconcile({});

    expect(report.matched).toBe(0);
    expect(report.discrepancies[0]).toMatchObject({
      type: 'amount_mismatch',
      orderId: 'o1',
      orderTotalCents: 3400,
      stripeAmountCents: 9999,
    });
  });

  it('detecta un pedido PAID sin cobro en Stripe', async () => {
    prismaMock.order.findMany.mockResolvedValue([
      { id: 'o1', totalCents: 3400, stripePaymentIntentId: 'pi_1' },
    ]);
    list.mockResolvedValue(stripePage([])); // Stripe no tiene ese cobro.

    const report = await service.reconcile({});

    expect(report.discrepancies[0]).toMatchObject({
      type: 'paid_without_stripe',
      orderId: 'o1',
    });
  });
});
