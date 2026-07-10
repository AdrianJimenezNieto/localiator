import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { OrderMailService } from './order-mail.service';
import { MailService } from './mail.service';
import { PrismaService } from '../prisma/prisma.service';

const mailMock = { send: jest.fn() };
const prismaMock = { order: { findUnique: jest.fn() } };
const configMock = { get: jest.fn(() => undefined) };

describe('OrderMailService', () => {
  let service: OrderMailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderMailService,
        { provide: MailService, useValue: mailMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(OrderMailService);
  });

  it('envía la confirmación con líneas y total al pagar', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      totalCents: 3400,
      user: { email: 'buyer@x.dev' },
      invoice: { number: '2026-000001' },
      lines: [{ nameSnapshot: 'Taladro', quantity: 2, lineTotalCents: 3400 }],
    });

    await service.sendOrderConfirmation('o1');

    expect(mailMock.send).toHaveBeenCalledTimes(1);
    const [to, subject] = mailMock.send.mock.calls[0] as [string, string];
    expect(to).toBe('buyer@x.dev');
    expect(subject).toContain('Pedido confirmado');
  });

  it('envía un email por cada transición relevante', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      user: { email: 'buyer@x.dev' },
    });

    await service.sendStatusChange('o1', OrderStatus.READY_FOR_PICKUP);
    await service.sendStatusChange('o1', OrderStatus.PICKED_UP);
    await service.sendStatusChange('o1', OrderStatus.CANCELLED);

    expect(mailMock.send).toHaveBeenCalledTimes(3);
  });

  it('no envía email para estados sin plantilla (p. ej. PAID)', async () => {
    await service.sendStatusChange('o1', OrderStatus.PAID);
    expect(mailMock.send).not.toHaveBeenCalled();
  });

  it('un fallo de envío no propaga (no revierte el pedido)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      totalCents: 100,
      user: { email: 'buyer@x.dev' },
      invoice: null,
      lines: [],
    });
    mailMock.send.mockRejectedValue(new Error('resend caído'));

    await expect(service.sendOrderConfirmation('o1')).resolves.toBeUndefined();
  });
});
