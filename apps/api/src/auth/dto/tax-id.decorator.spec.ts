import { isValidSpanishTaxId } from './tax-id.decorator';

// El NIF acaba impreso en una factura completa y declarado a Hacienda, así que
// validar solo la FORMA no basta: un dígito mal tecleado da un NIF con pinta
// correcta pero de otra persona (o de nadie). Estos casos fijan el algoritmo.
describe('isValidSpanishTaxId', () => {
  it('acepta un DNI con letra de control correcta', () => {
    // 12345678 % 23 = 14 → 'Z'
    expect(isValidSpanishTaxId('12345678Z')).toBe(true);
  });

  it('rechaza un DNI con la letra cambiada', () => {
    expect(isValidSpanishTaxId('12345678A')).toBe(false);
  });

  it('acepta un NIE (la letra inicial se traduce a dígito)', () => {
    // X1234567 → 01234567 % 23 = 12 → 'L'
    expect(isValidSpanishTaxId('X1234567L')).toBe(true);
  });

  it('rechaza un NIE con control incorrecto', () => {
    expect(isValidSpanishTaxId('X1234567A')).toBe(false);
  });

  it('acepta un CIF válido', () => {
    expect(isValidSpanishTaxId('A58818501')).toBe(true);
  });

  it('rechaza un CIF con control incorrecto', () => {
    expect(isValidSpanishTaxId('A58818502')).toBe(false);
  });

  it('normaliza espacios, guiones y minúsculas', () => {
    expect(isValidSpanishTaxId(' 12345678-z ')).toBe(true);
  });

  it('rechaza basura y formatos de otros países', () => {
    for (const value of ['', 'ABC', '1234', 'DE123456789', '123456789']) {
      expect(isValidSpanishTaxId(value)).toBe(false);
    }
  });
});
