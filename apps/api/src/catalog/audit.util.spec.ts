import { AuditField } from '@prisma/client';
import { diffAuditableFields } from './audit.util';

describe('diffAuditableFields', () => {
  const before = { priceCents: 5000, discountCents: 500, stock: 3 };

  it('no devuelve entradas si nada auditable cambia', () => {
    expect(diffAuditableFields(before, { ...before })).toEqual([]);
  });

  it('devuelve una entrada solo por el campo de precio cambiado', () => {
    const changes = diffAuditableFields(before, {
      ...before,
      priceCents: 6000,
    });
    expect(changes).toEqual([
      { field: AuditField.PRICE, oldValue: 5000, newValue: 6000 },
    ]);
  });

  it('devuelve una entrada por cada campo cambiado (precio + stock)', () => {
    const changes = diffAuditableFields(before, {
      priceCents: 6000,
      discountCents: 500,
      stock: 10,
    });
    expect(changes).toEqual([
      { field: AuditField.PRICE, oldValue: 5000, newValue: 6000 },
      { field: AuditField.STOCK, oldValue: 3, newValue: 10 },
    ]);
  });
});
