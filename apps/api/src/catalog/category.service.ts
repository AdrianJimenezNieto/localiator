import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from './slug.util';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Listado público (lo consume el catálogo del frontend para el selector de
  // filtros). Orden alfabético estable.
  findAll() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) {
      // Un nombre solo de símbolos (p. ej. "!!!") daría slug vacío: lo rechazamos
      // con 400 en vez de intentar guardar un slug inválido.
      throw new BadRequestException(
        'No se pudo generar un slug a partir del nombre; indica uno manualmente',
      );
    }

    if (dto.parentId) {
      await this.assertParentExists(dto.parentId);
    }

    try {
      return await this.prisma.category.create({
        data: { name: dto.name, slug, parentId: dto.parentId ?? null },
      });
    } catch (error) {
      // P2002 = violación de @unique(slug). Lo traducimos a un 409 legible en vez
      // de dejar escapar el error crudo de Prisma como un 500.
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Ya existe una categoría con el slug "${slug}"`,
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.assertExists(id);

    // Si cambian el nombre pero no el slug, NO regeneramos el slug: cambiar la URL
    // de una categoría existente rompería enlaces/SEO. El slug solo cambia si el
    // admin lo manda explícitamente.
    const slug = dto.slug;

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException(
          'Una categoría no puede ser su propia padre',
        );
      }
      await this.assertParentExists(dto.parentId);
    }

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(slug !== undefined && { slug }),
          ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Ya existe una categoría con el slug "${slug}"`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.assertExists(id);

    // Borrado seguro: si la categoría tiene productos o lotes asociados, bloqueamos
    // el borrado (409) en vez de dejar artículos huérfanos o borrarlos en cascada.
    const [products, lots] = await Promise.all([
      this.prisma.product.count({ where: { categoryId: id } }),
      this.prisma.lot.count({ where: { categoryId: id } }),
    ]);
    if (products + lots > 0) {
      throw new ConflictException(
        'No se puede borrar una categoría con productos o lotes asociados',
      );
    }

    await this.prisma.category.delete({ where: { id } });
    return { id };
  }

  private async assertExists(id: string) {
    const found = await this.prisma.category.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Categoría no encontrada');
    }
  }

  // Validamos el padre en el service para devolver un 400 claro en vez del P2003
  // opaco de la FK de Prisma.
  private async assertParentExists(parentId: string) {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      throw new BadRequestException('La categoría padre indicada no existe');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
