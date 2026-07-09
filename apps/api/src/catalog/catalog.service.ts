import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemCondition } from '@prisma/client';
import type {
  CatalogDetail,
  CatalogItem,
  ItemKind,
  Paginated,
} from '@localiator/shared';
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

// Campos visibles de la FICHA (más que la tarjeta, pero sigue siendo un select
// explícito: no se vuelca el registro entero ni campos internos).
const DETAIL_SELECT = {
  id: true,
  name: true,
  description: true,
  condition: true,
  priceCents: true,
  discountCents: true,
  stock: true,
  photos: true,
  category: { select: { id: true, name: true } },
} as const;

interface DetailRow extends CardRow {
  description: string;
  stock: number;
}

function toCatalogDetail(row: DetailRow, kind: ItemKind): CatalogDetail {
  return {
    id: row.id,
    kind,
    name: row.name,
    description: row.description,
    condition: row.condition,
    priceCents: row.priceCents,
    discountCents: row.discountCents,
    available: row.stock > 0, // no exponemos el stock exacto, solo disponibilidad.
    photos: row.photos,
    category: row.category,
  };
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

  async getProduct(id: string): Promise<CatalogDetail> {
    // findFirst con el criterio de visibilidad (mismo que el listado: stock > 0):
    // un artículo inexistente O agotado devuelve null → 404 limpio, no un error de
    // Prisma ni una ficha de algo no vendible.
    const row = await this.prisma.product.findFirst({
      where: { id, stock: { gt: 0 } },
      select: DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Producto no encontrado');
    }
    return toCatalogDetail(row, 'product');
  }

  async getLot(id: string): Promise<CatalogDetail> {
    const row = await this.prisma.lot.findFirst({
      where: { id, stock: { gt: 0 } },
      select: DETAIL_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Lote no encontrado');
    }
    return toCatalogDetail(row, 'lot');
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

    const where = this.buildWhere(dto);
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

  // Construye el `where` de Prisma a partir de los filtros. Cada filtro presente
  // añade una condición; ausente, no filtra. La base común (solo vendibles: stock
  // > 0) es la misma para producto y lote. Prisma parametriza las consultas, así
  // que no hay riesgo de inyección; aun así el DTO valida y acota el shape (07).
  private buildWhere(dto: ListCatalogDto) {
    // Solo artículos vendibles: los agotados (stock 0) no se listan en el catálogo
    // público. Criterio documentado; cuando en Fase 3 haya soft-delete se ampliará.
    const where: {
      stock: { gt: number };
      categoryId?: string;
      condition?: { in: ItemCondition[] };
      priceCents?: { gte?: number; lte?: number };
      OR?: Array<
        | { name: { contains: string; mode: 'insensitive' } }
        | { description: { contains: string; mode: 'insensitive' } }
      >;
    } = { stock: { gt: 0 } };

    if (dto.q) {
      // Búsqueda case-insensitive en nombre O descripción.
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }

    if (dto.categoryId) {
      where.categoryId = dto.categoryId;
    }

    if (dto.condition && dto.condition.length > 0) {
      where.condition = { in: dto.condition };
    }

    if (dto.minPriceCents !== undefined || dto.maxPriceCents !== undefined) {
      where.priceCents = {
        ...(dto.minPriceCents !== undefined && { gte: dto.minPriceCents }),
        ...(dto.maxPriceCents !== undefined && { lte: dto.maxPriceCents }),
      };
    }

    return where;
  }
}
