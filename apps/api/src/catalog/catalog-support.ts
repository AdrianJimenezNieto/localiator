import { BadRequestException } from '@nestjs/common';

// Validaciones puras y comunes a Product y Lot. Se comparten a propósito (son
// reglas estables e independientes del dominio de cada entidad) SIN fusionar las
// tablas ni crear una jerarquía: producto y lote siguen siendo entidades separadas.

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
