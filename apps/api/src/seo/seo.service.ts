import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuctionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../catalog/slug.util';

// Ruta pública de una ficha con URL amigable. Refleja `itemPath` de
// @localiator/shared (que usa el frontend); se replica aquí porque la API solo
// puede importar TIPOS de shared, no funciones en runtime (ts-jest no transforma
// node_modules). Si una cambia, la otra debe seguirla.
function itemPath(kind: 'product' | 'lot', id: string, name: string): string {
  const base = kind === 'lot' ? 'lotes' : 'productos';
  const slug = slugify(name);
  return slug ? `/${base}/${id}/${slug}` : `/${base}/${id}`;
}

// Rutas privadas o sin valor SEO que NO deben indexarse (backoffice, checkout y
// área de usuario). El robots las bloquea.
const DISALLOWED_PATHS = [
  '/admin',
  '/carrito',
  '/checkout',
  '/cuenta',
  '/mis-pedidos',
  '/login',
  '/registro',
];

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Base pública de la WEB (no de la API): las URLs del sitemap apuntan a las
  // fichas del frontend. PUBLIC_WEB_URL permite fijarla en producción; si no,
  // reutiliza APP_URL (el mismo origen que ya usa el resto de la app).
  private webBase(): string {
    return (
      this.config.get<string>('PUBLIC_WEB_URL') ??
      this.config.get<string>('APP_URL') ??
      'http://localhost:5173'
    );
  }

  // Genera el sitemap con SOLO contenido público: la home, el listado de subastas
  // y las fichas de productos/lotes vendibles (stock > 0, mismo criterio de
  // visibilidad que el catálogo). Se construye desde la BD para que refleje el
  // catálogo real sin recompilar.
  async buildSitemap(): Promise<string> {
    const base = this.webBase();
    const select = { id: true, name: true, updatedAt: true } as const;
    const where = { stock: { gt: 0 } };

    const [products, lots, auctions] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, select }),
      this.prisma.lot.findMany({ where, select }),
      // Subastas indexables: las que se pueden pujar o se van a poder. Las cerradas
      // se quedan fuera para no llenar el sitemap de páginas sin acción posible
      // (mismo criterio que el default del listado público, tarea 12).
      this.prisma.auction.findMany({
        where: {
          status: { in: [AuctionStatus.LIVE, AuctionStatus.SCHEDULED] },
        },
        select: { id: true, updatedAt: true },
      }),
    ]);

    const urls: string[] = [urlEntry(base, '/'), urlEntry(base, '/subastas')];
    for (const p of products) {
      urls.push(urlEntry(base, itemPath('product', p.id, p.name), p.updatedAt));
    }
    for (const l of lots) {
      urls.push(urlEntry(base, itemPath('lot', l.id, l.name), l.updatedAt));
    }
    for (const a of auctions) {
      urls.push(urlEntry(base, `/subastas/${a.id}`, a.updatedAt));
    }

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.join('\n') +
      '\n</urlset>\n'
    );
  }

  // robots.txt: permite el catálogo, bloquea las rutas privadas y apunta al
  // sitemap. La URL del sitemap se da absoluta (requisito del estándar).
  buildRobots(): string {
    const base = this.webBase();
    const disallow = DISALLOWED_PATHS.map((p) => `Disallow: ${p}`).join('\n');
    return (
      'User-agent: *\n' +
      'Allow: /\n' +
      `${disallow}\n\n` +
      `Sitemap: ${base}/sitemap.xml\n`
    );
  }
}

// Una entrada <url> del sitemap. `loc` se escapa por si un slug/base trajera
// caracteres XML reservados (defensa en profundidad; los slugs ya son seguros).
function urlEntry(base: string, path: string, lastmod?: Date): string {
  const loc = escapeXml(`${base}${path}`);
  const lastmodTag = lastmod
    ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>`
    : '';
  return `  <url><loc>${loc}</loc>${lastmodTag}</url>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
