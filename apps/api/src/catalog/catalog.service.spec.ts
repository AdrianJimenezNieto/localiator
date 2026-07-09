import { Test } from '@nestjs/testing';
import { ItemCondition } from '@prisma/client';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE } from './dto/list-catalog.dto';

const prismaMock = {
  product: { findMany: jest.fn(), count: jest.fn() },
  lot: { findMany: jest.fn(), count: jest.fn() },
  // $transaction en forma de array resuelve el array de promesas que le pasamos.
  $transaction: jest.fn(),
};

type TxArray = [Promise<unknown>, Promise<unknown>];

const row = {
  id: 'p1',
  name: 'Taladro',
  priceCents: 5000,
  discountCents: 500,
  condition: ItemCondition.GOOD,
  photos: ['http://x/a.jpg', 'http://x/b.jpg'],
  category: { id: 'c1', name: 'Herramientas' },
};

describe('CatalogService', () => {
  let service: CatalogService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((ops: TxArray) =>
      Promise.all(ops),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(CatalogService);
  });

  it('devuelve la página con metadatos y mapea la tarjeta (portada = primera foto)', async () => {
    prismaMock.product.findMany.mockResolvedValue([row]);
    prismaMock.product.count.mockResolvedValue(1);

    const result = await service.listProducts({ page: 1, pageSize: 10 });

    expect(result).toEqual({
      items: [
        {
          id: 'p1',
          kind: 'product',
          name: 'Taladro',
          priceCents: 5000,
          discountCents: 500,
          condition: ItemCondition.GOOD,
          photo: 'http://x/a.jpg',
          category: { id: 'c1', name: 'Herramientas' },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
  });

  it('solo lista artículos vendibles (stock > 0) y ordena por createdAt desc', async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    prismaMock.product.count.mockResolvedValue(0);

    await service.listProducts({ page: 2, pageSize: 10 });

    expect(prismaMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stock: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        skip: 10, // (page 2 - 1) * 10
        take: 10,
      }),
    );
  });

  it('aplica page y pageSize por defecto cuando no se indican', async () => {
    prismaMock.lot.findMany.mockResolvedValue([]);
    prismaMock.lot.count.mockResolvedValue(0);

    const result = await service.listLots({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(prismaMock.lot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: DEFAULT_PAGE_SIZE }),
    );
  });

  it('usa el delegate de lotes para el catálogo de lotes (kind = lot)', async () => {
    prismaMock.lot.findMany.mockResolvedValue([{ ...row, id: 'l1' }]);
    prismaMock.lot.count.mockResolvedValue(1);

    const result = await service.listLots({});

    expect(result.items[0].kind).toBe('lot');
    expect(prismaMock.product.findMany).not.toHaveBeenCalled();
  });

  describe('filtros (07)', () => {
    function whereOfLastFindMany(): Record<string, unknown> {
      const call = prismaMock.product.findMany.mock.calls.at(-1) as [
        { where: Record<string, unknown> },
      ];
      return call[0].where;
    }

    beforeEach(() => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);
    });

    it('busca por texto (case-insensitive) en nombre y descripción', async () => {
      await service.listProducts({ q: 'taladro' });

      expect(whereOfLastFindMany()).toEqual({
        stock: { gt: 0 },
        OR: [
          { name: { contains: 'taladro', mode: 'insensitive' } },
          { description: { contains: 'taladro', mode: 'insensitive' } },
        ],
      });
    });

    it('filtra por categoría', async () => {
      await service.listProducts({ categoryId: 'c1' });
      expect(whereOfLastFindMany()).toMatchObject({ categoryId: 'c1' });
    });

    it('filtra por rango de precio (gte/lte)', async () => {
      await service.listProducts({ minPriceCents: 1000, maxPriceCents: 5000 });
      expect(whereOfLastFindMany()).toMatchObject({
        priceCents: { gte: 1000, lte: 5000 },
      });
    });

    it('filtra por varios estados (in)', async () => {
      await service.listProducts({
        condition: [ItemCondition.NEW, ItemCondition.GOOD],
      });
      expect(whereOfLastFindMany()).toMatchObject({
        condition: { in: [ItemCondition.NEW, ItemCondition.GOOD] },
      });
    });

    it('sin filtros solo aplica la base de vendibles', async () => {
      await service.listProducts({});
      expect(whereOfLastFindMany()).toEqual({ stock: { gt: 0 } });
    });
  });
});
