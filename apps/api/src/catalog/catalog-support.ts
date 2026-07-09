import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Validaciones puras y comunes a Product y Lot. Se comparten a propósito (son
// reglas estables e independientes del dominio de cada entidad) SIN fusionar las
// tablas ni crear una jerarquía: producto y lote siguen siendo entidades separadas.

// Devuelve un 400 claro si la categoría no existe, en vez del P2003 opaco que
// lanzaría la FK de Prisma al intentar crear con un categoryId inexistente.
export async function assertCategoryExists(
  prisma: PrismaService,
  categoryId: string,
): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });
  if (!category) {
    throw new BadRequestException('La categoría indicada no existe');
  }
}

// Coherencia del dinero: el descuento nunca puede superar al precio. El DTO ya lo
// valida cuando ambos llegan juntos; esto cubre el PATCH parcial donde solo cambia
// uno y hay que comparar contra el valor ya persistido.
export function assertDiscountNotAbovePrice(
  priceCents: number,
  discountCents: number,
): void {
  if (discountCents > priceCents) {
    throw new BadRequestException(
      'El descuento no puede ser mayor que el precio',
    );
  }
}
