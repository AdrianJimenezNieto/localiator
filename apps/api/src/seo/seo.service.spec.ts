import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SeoService } from './seo.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  product: { findMany: jest.fn() },
  lot: { findMany: jest.fn() },
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
};

// PUBLIC_WEB_URL fija la base de las URLs del sitemap.
const configMock = {
  get: jest.fn((key: string) =>
    key === 'PUBLIC_WEB_URL' ? 'https://localiator.example' : undefined,
  ),
};

describe('SeoService', () => {
  let service: SeoService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((ops: unknown[]) =>
      Promise.all(ops),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        SeoService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(SeoService);
  });

  describe('buildSitemap', () => {
    it('incluye la home y las fichas de productos/lotes con URL amigable', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Taladro Bosch', updatedAt: new Date('2026-07-01') },
      ]);
      prismaMock.lot.findMany.mockResolvedValue([
        {
          id: 'l1',
          name: 'Lote de 5 sillas',
          updatedAt: new Date('2026-07-02'),
        },
      ]);

      const xml = await service.buildSitemap();

      expect(xml).toContain('<loc>https://localiator.example/</loc>');
      expect(xml).toContain(
        '<loc>https://localiator.example/productos/p1/taladro-bosch</loc>',
      );
      expect(xml).toContain(
        '<loc>https://localiator.example/lotes/l1/lote-de-5-sillas</loc>',
      );
      expect(xml).toContain('<lastmod>2026-07-01</lastmod>');
    });

    it('solo consulta artículos vendibles (stock > 0)', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.lot.findMany.mockResolvedValue([]);

      await service.buildSitemap();

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { stock: { gt: 0 } } }),
      );
    });
  });

  describe('buildRobots', () => {
    it('bloquea las rutas privadas y enlaza el sitemap', () => {
      const robots = service.buildRobots();

      expect(robots).toContain('Disallow: /admin');
      expect(robots).toContain('Disallow: /checkout');
      expect(robots).toContain('Disallow: /cuenta');
      expect(robots).toContain(
        'Sitemap: https://localiator.example/sitemap.xml',
      );
    });
  });
});
