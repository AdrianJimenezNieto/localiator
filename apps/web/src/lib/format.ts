import { ItemCondition } from '@localiator/shared';

// Formatea céntimos (enteros, como los guarda el backend) a euros para la UI. La
// conversión céntimos↔euros vive SOLO aquí para no repetir la aritmética.
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

// Precio final tras aplicar el descuento (en céntimos).
export function finalPriceCents(priceCents: number, discountCents: number): number {
  return Math.max(0, priceCents - discountCents);
}

// Etiquetas legibles en español para el estado del artículo.
const CONDITION_LABELS: Record<ItemCondition, string> = {
  [ItemCondition.NEW]: 'Nuevo',
  [ItemCondition.LIKE_NEW]: 'Como nuevo',
  [ItemCondition.GOOD]: 'Buen estado',
  [ItemCondition.FAIR]: 'Aceptable',
  [ItemCondition.DAMAGED]: 'Con desperfectos',
};

export function conditionLabel(condition: ItemCondition): string {
  return CONDITION_LABELS[condition] ?? condition;
}
