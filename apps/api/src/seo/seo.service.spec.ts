import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SeoService } from './seo.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  product: { findMany: jest.fn() },
  lot: { findMany: jest.fn() },
  // El sitemap incluye el listado y las fichas de subasta (tarea 13).
  auction: { findMany: jest.fn() },
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
    beforeEach(() => {
      // Por defecto, sin subastas: cada test añade las suyas si le interesan.
      prismaMock.auction.findMany.mockResolvedValue([]);
    });

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

    // Tarea 13: las subastas son contenido público y deben ser encontrables.
    it('incluye el listado y las fichas de subastas indexables', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.lot.findMany.mockResolvedValue([]);
      prismaMock.auction.findMany.mockResolvedValue([
        { id: 'a1', updatedAt: new Date('2026-07-03') },
      ]);

      const xml = await service.buildSitemap();

      expect(xml).toContain('<loc>https://localiator.example/subastas</loc>');
      expect(xml).toContain(
        '<loc>https://localiator.example/subastas/a1</loc>',
      );
    });

    // Una subasta cerrada o cancelada no ofrece ninguna acción: no llena el sitemap.
    it('no indexa subastas que no se pueden pujar', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.lot.findMany.mockResolvedValue([]);

      await service.buildSitemap();

      const [call] = prismaMock.auction.findMany.mock.calls as Array<
        [{ where: { status: { in: string[] } } }]
      >;
      expect(call[0].where.status.in).toEqual(['LIVE', 'SCHEDULED']);
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
