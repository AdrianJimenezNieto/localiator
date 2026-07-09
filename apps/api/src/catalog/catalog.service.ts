import { Injectable } from '@nestjs/common';
import { ItemCondition } from '@prisma/client';
import type { CatalogItem, ItemKind, Paginated } from '@localiator/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, ListCatalogDto } from './dto/list-catalog.dto';

// Solo los campos que necesita la TARJETA del catálogo (no todo el registro): evita
// sobre-transferir datos y no expone campos internos por accidente.
const CARD_SELECT = {
  id: true,
  name: true,
  priceCents: true,
  discountCents: true,
  condition: true,
  photos: true,
  category: { select: { id: true, name: true } },
} as const;

// Forma de una fila devuelta con CARD_SELECT (producto o lote: misma forma).
interface CardRow {
  id: string;
  name: string;
  priceCents: number;
  discountCents: number;
  condition: ItemCondition;
  photos: string[];
  category: { id: string; name: string };
}

function toCatalogItem(row: CardRow, kind: ItemKind): CatalogItem {
  return {
    id: row.id,
    kind,
    name: row.name,
    priceCents: row.priceCents,
    discountCents: row.discountCents,
    condition: row.condition,
    photo: row.photos[0] ?? null, // portada = primera foto (o null si no hay).
    category: row.category,
  };
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(dto: ListCatalogDto): Promise<Paginated<CatalogItem>> {
    return this.paginate('product', dto);
  }

  listLots(dto: ListCatalogDto): Promise<Paginated<CatalogItem>> {
    return this.paginate('lot', dto);
  }

  // Núcleo compartido de la paginación. Producto y lote son tablas separadas, así
  // que elegimos el delegate según `kind`, pero la lógica de paginar/ordenar/mapear
  // es idéntica y se comparte aquí.
  private async paginate(
    kind: ItemKind,
    dto: ListCatalogDto,
  ): Promise<Paginated<CatalogItem>> {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    // Solo artículos vendibles: los agotados (stock 0) no se listan en el catálogo
    // público. Criterio documentado; cuando en Fase 3 haya soft-delete se ampliará.
    const where = { stock: { gt: 0 } };
    // orderBy estable (createdAt desc): la paginación no baila entre páginas.
    const findManyArgs = {
      where,
      select: CARD_SELECT,
      orderBy: { createdAt: 'desc' as const },
      skip,
      take: pageSize,
    };

    // findMany + count en la MISMA transacción → el `total` es coherente con la
    // página devuelta aunque entren escrituras concurrentes entre ambas consultas.
    // Se ramifica por entidad (tablas separadas) en vez de un delegate en unión,
    // que Prisma no tipa bien.
    const [rows, total] =
      kind === 'product'
        ? await this.prisma.$transaction([
            this.prisma.product.findMany(findManyArgs),
            this.prisma.product.count({ where }),
          ])
        : await this.prisma.$transaction([
            this.prisma.lot.findMany(findManyArgs),
            this.prisma.lot.count({ where }),
          ]);

    return {
      items: rows.map((row) => toCatalogItem(row, kind)),
      total,
      page,
      pageSize,
    };
  }
}
