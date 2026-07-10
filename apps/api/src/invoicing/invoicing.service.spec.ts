import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InvoicingService } from './invoicing.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  invoice: { findUnique: jest.fn(), create: jest.fn() },
  order: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

type TxCallback = (tx: typeof prismaMock) => unknown;

const configMock = { get: jest.fn(() => undefined) };

describe('InvoicingService', () => {
  let service: InvoicingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((cb: TxCallback) =>
      cb(prismaMock),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoicingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(InvoicingService);
  });

  describe('breakdownFromGross', () => {
    it('desglosa un importe con IVA incluido y net + vat = gross', () => {
      const { netCents, vatCents } = InvoicingService.breakdownFromGross(3400);
      // 3400 con 21 % incluido → base 2810, cuota 590.
      expect(netCents).toBe(2810);
      expect(vatCents).toBe(590);
      expect(netCents + vatCents).toBe(3400);
    });

    it('cuadra siempre (net + vat = gross) para importes con redondeo feo', () => {
      for (const gross of [999, 1234, 4501, 10007]) {
        const { netCents, vatCents } =
          InvoicingService.breakdownFromGross(gross);
        expect(netCents + vatCents).toBe(gross);
      }
    });
  });

  describe('generateForOrder', () => {
    it('genera número correlativo y desglose para un pedido', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(null);
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'o1',
        totalCents: 3400,
        user: { email: 'buyer@x.dev' },
      });
      prismaMock.$queryRaw.mockResolvedValue([{ lastNumber: 123 }]);
      prismaMock.invoice.create.mockImplementation(
        ({ data }: { data: unknown }) => data,
      );

      const invoice = (await service.generateForOrder('o1')) as unknown as {
        number: string;
        netCents: number;
        vatCents: number;
        grossCents: number;
      };

      const year = new Date().getFullYear();
      expect(invoice.number).toBe(`${year}-000123`);
      expect(invoice.netCents).toBe(2810);
      expect(invoice.vatCents).toBe(590);
      expect(invoice.grossCents).toBe(3400);
    });

    it('es idempotente: devuelve la factura existente sin crear otra', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        id: 'inv1',
        number: '2026-000001',
      });

      const invoice = await service.generateForOrder('o1');

      expect(invoice).toMatchObject({ number: '2026-000001' });
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });
  });
});
