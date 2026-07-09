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

// Estados en orden de mejor a peor, para poblar el filtro de la web.
export const CONDITION_OPTIONS: { value: ItemCondition; label: string }[] = [
  ItemCondition.NEW,
  ItemCondition.LIKE_NEW,
  ItemCondition.GOOD,
  ItemCondition.FAIR,
  ItemCondition.DAMAGED,
].map((value) => ({ value, label: CONDITION_LABELS[value] }));

// Céntimos → euros como string editable (para prefijar formularios de edición).
export function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Euros (lo que teclea el usuario) → céntimos (lo que espera la API). Devuelve
// undefined si el campo está vacío o no es un número válido.
export function eurosToCents(euros: string): number | undefined {
  const trimmed = euros.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}
