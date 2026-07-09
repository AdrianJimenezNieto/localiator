import { AuditField } from '@prisma/client';

// Instantánea de los campos auditables de un producto/lote. Solo estos tres se
// auditan (exigencia de CLAUDE.md: registrar cambios de precio y stock).
export interface AuditableSnapshot {
  priceCents: number;
  discountCents: number;
  stock: number;
}

export interface AuditChange {
  field: AuditField;
  oldValue: number;
  newValue: number;
}

// Cada campo auditable con su etiqueta de AuditField. Un array (no un objeto) para
// que el orden de las entradas generadas sea estable y predecible en los tests.
const AUDITABLE_FIELDS: ReadonlyArray<[keyof AuditableSnapshot, AuditField]> = [
  ['priceCents', AuditField.PRICE],
  ['discountCents', AuditField.DISCOUNT],
  ['stock', AuditField.STOCK],
];

// Compara el antes y el después y devuelve UNA entrada por campo auditable que
// realmente cambió (el esquema tiene una fila por `field`). Si nada auditable
// cambia, devuelve []: no se registra ruido.
export function diffAuditableFields(
  before: AuditableSnapshot,
  after: AuditableSnapshot,
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [key, field] of AUDITABLE_FIELDS) {
    if (before[key] !== after[key]) {
      changes.push({ field, oldValue: before[key], newValue: after[key] });
    }
  }
  return changes;
}
