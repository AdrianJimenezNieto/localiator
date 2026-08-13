import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InvoicingService } from './invoicing.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  invoice: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
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
    const order = {
      id: 'o1',
      totalCents: 3400,
      lines: [
        {
          nameSnapshot: 'Taladro',
          quantity: 2,
          unitPriceCents: 1700,
          lineTotalCents: 3400,
        },
      ],
      user: {
        email: 'buyer@x.dev',
        taxId: null,
        firstName: 'Ana',
        lastName: 'Pérez',
        addressLine1: 'Calle X 1',
        addressLine2: null,
        postalCode: '50001',
        city: 'Zaragoza',
        province: 'Zaragoza',
        country: 'ES',
      },
    };

    // REBU (por defecto): la factura NO desglosa cuota, porque bajo el régimen de
    // bienes usados el IVA se liquida sobre el margen y no se repercute al cliente.
    it('bajo REBU emite sin desglose de IVA y con número correlativo', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);
      prismaMock.order.findUnique.mockResolvedValue(order);
      prismaMock.$queryRaw.mockResolvedValue([{ lastNumber: 123 }]);
      prismaMock.invoice.create.mockImplementation(
        ({ data }: { data: unknown }) => data,
      );

      const invoice = (await service.generateForOrder('o1')) as unknown as {
        number: string;
        netCents: number | null;
        vatCents: number | null;
        grossCents: number;
        regime: string;
        type: string;
      };

      const year = new Date().getFullYear();
      expect(invoice.number).toBe(`${year}-000123`);
      expect(invoice.regime).toBe('REBU');
      expect(invoice.netCents).toBeNull();
      expect(invoice.vatCents).toBeNull();
      expect(invoice.grossCents).toBe(3400);
    });

    // Sin NIF del cliente lo que procede es una factura SIMPLIFICADA, que no
    // identifica al destinatario. No es un dato que falte: es que no aplica.
    it('sin NIF emite SIMPLIFICADA y no copia los datos del destinatario', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);
      prismaMock.order.findUnique.mockResolvedValue(order);
      prismaMock.$queryRaw.mockResolvedValue([{ lastNumber: 1 }]);
      prismaMock.invoice.create.mockImplementation(
        ({ data }: { data: unknown }) => data,
      );

      const invoice = (await service.generateForOrder('o1')) as unknown as {
        type: string;
        customerName: string | null;
        customerTaxId: string | null;
      };

      expect(invoice.type).toBe('SIMPLIFIED');
      expect(invoice.customerName).toBeNull();
      expect(invoice.customerTaxId).toBeNull();
    });

    it('con NIF emite COMPLETA con nombre, NIF y domicilio del cliente', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);
      prismaMock.order.findUnique.mockResolvedValue({
        ...order,
        user: { ...order.user, taxId: '12345678Z' },
      });
      prismaMock.$queryRaw.mockResolvedValue([{ lastNumber: 1 }]);
      prismaMock.invoice.create.mockImplementation(
        ({ data }: { data: unknown }) => data,
      );

      const invoice = (await service.generateForOrder('o1')) as unknown as {
        type: string;
        customerName: string;
        customerTaxId: string;
        customerAddress: string;
      };

      expect(invoice.type).toBe('FULL');
      expect(invoice.customerName).toBe('Ana Pérez');
      expect(invoice.customerTaxId).toBe('12345678Z');
      expect(invoice.customerAddress).toContain('Zaragoza');
    });

    // La descripción de las operaciones es obligatoria en TODOS los formatos.
    it('copia las líneas del pedido al documento', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);
      prismaMock.order.findUnique.mockResolvedValue(order);
      prismaMock.$queryRaw.mockResolvedValue([{ lastNumber: 1 }]);
      prismaMock.invoice.create.mockImplementation(
        ({ data }: { data: unknown }) => data,
      );

      const invoice = (await service.generateForOrder('o1')) as unknown as {
        lines: { create: { description: string; quantity: number }[] };
      };

      expect(invoice.lines.create).toEqual([
        {
          description: 'Taladro',
          quantity: 2,
          unitPriceCents: 1700,
          lineTotalCents: 3400,
        },
      ]);
    });

    it('es idempotente: devuelve la factura existente sin crear otra', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        id: 'inv1',
        number: '2026-000001',
        lines: [],
      });

      const invoice = await service.generateForOrder('o1');

      expect(invoice).toMatchObject({ number: '2026-000001' });
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('rectificativas', () => {
    const original = {
      id: 'inv1',
      number: '2026-000010',
      regime: 'REBU',
      type: 'SIMPLIFIED',
      lines: [],
    };

    // Art. 15 RD 1619/2012: serie propia, importes en negativo y motivo impreso.
    it('emite en serie R, en negativo y citando la original', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(original);
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'o1',
        user: { email: 'b@x.dev', taxId: null, firstName: 'Ana' },
      });
      prismaMock.$queryRaw.mockResolvedValue([{ lastNumber: 4 }]);
      prismaMock.invoice.create.mockImplementation(
        ({ data }: { data: unknown }) => data,
      );

      const doc = (await service.generateCorrective({
        orderId: 'o1',
        deltaCents: 1000,
        reason: 'Reembolso parcial del pedido',
      })) as unknown as {
        number: string;
        series: string;
        grossCents: number;
        correctsInvoiceId: string;
        correctionReason: string;
        type: string;
      };

      const year = new Date().getFullYear();
      expect(doc.number).toBe(`R${year}-000004`);
      expect(doc.series).toBe('R');
      expect(doc.type).toBe('CORRECTIVE');
      expect(doc.grossCents).toBe(-1000); // la corrección, no un total nuevo
      expect(doc.correctsInvoiceId).toBe('inv1');
      expect(doc.correctionReason).toBe('Reembolso parcial del pedido');
    });

    it('no rectifica un pedido que no llegó a facturarse', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const doc = await service.generateCorrective({
        orderId: 'o1',
        deltaCents: 1000,
        reason: 'x',
      });

      expect(doc).toBeNull();
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('renderHtml', () => {
    const base = {
      id: 'inv1',
      orderId: 'o1',
      number: '2026-000001',
      series: '',
      type: 'SIMPLIFIED',
      regime: 'REBU',
      issuedAt: new Date('2026-08-10T10:00:00Z'),
      grossCents: 3400,
      netCents: null,
      vatCents: null,
      vatRateBps: null,
      issuerName: 'Localiator',
      issuerTaxId: 'B00000000',
      issuerAddress: 'Calle Y 2',
      customerEmail: 'b@x.dev',
      customerName: null,
      customerTaxId: null,
      customerAddress: null,
      correctsInvoiceId: null,
      correctionReason: null,
      lines: [
        {
          description: 'Taladro',
          quantity: 2,
          unitPriceCents: 1700,
          lineTotalCents: 3400,
        },
      ],
    };

    it('bajo REBU imprime la mención legal y NO desglosa IVA', () => {
      const html = service.renderHtml(base as never);

      expect(html).toContain('Régimen especial de los bienes usados');
      expect(html).not.toContain('Base imponible');
      expect(html).not.toContain('IVA (');
    });

    it('en régimen general sí desglosa base y cuota', () => {
      const html = service.renderHtml({
        ...base,
        regime: 'GENERAL',
        netCents: 2810,
        vatCents: 590,
        vatRateBps: 2100,
      } as never);

      expect(html).toContain('Base imponible');
      expect(html).toContain('IVA (21 %)');
    });

    // La factura se sirve como text/html: el nombre del artículo es entrada de
    // usuario y sin escapar sería XSS al abrir el documento.
    it('escapa el HTML de la descripción de las líneas', () => {
      const html = service.renderHtml({
        ...base,
        lines: [
          {
            description: '<script>alert(1)</script>',
            quantity: 1,
            unitPriceCents: 100,
            lineTotalCents: 100,
          },
        ],
      } as never);

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
