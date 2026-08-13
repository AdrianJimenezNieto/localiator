import { registerDecorator, ValidationOptions } from 'class-validator';

// Letra de control del DNI/NIE: el resto de dividir el número entre 23 indexa
// esta cadena. Es el algoritmo oficial, no una heurística.
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

// NIE: la letra inicial se sustituye por un dígito antes de aplicar el mismo
// cálculo que el DNI (X→0, Y→1, Z→2).
const NIE_PREFIX: Record<string, string> = { X: '0', Y: '1', Z: '2' };

// CIF (personas jurídicas): letra inicial de tipo de entidad + 7 dígitos + dígito
// o letra de control.
const CIF_RE = /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/i;
const DNI_RE = /^\d{8}[A-Z]$/i;
const NIE_RE = /^[XYZ]\d{7}[A-Z]$/i;

// Valida NIF (DNI), NIE o CIF españoles COMPROBANDO EL DÍGITO DE CONTROL, no solo
// la forma. Importa porque el NIF acaba impreso en una factura completa: un NIF
// mal tecleado hace que el cliente no pueda deducirse el gasto y que el dato que
// declaramos no case con el de Hacienda.
//
// El CIF se valida por forma y por su dígito de control; para el resto se aplica
// el algoritmo módulo 23.
export function isValidSpanishTaxId(value: string): boolean {
  const id = value.trim().toUpperCase().replace(/[\s-]/g, '');

  if (DNI_RE.test(id)) {
    const number = Number(id.slice(0, 8));
    return DNI_LETTERS[number % 23] === id[8];
  }

  if (NIE_RE.test(id)) {
    const number = Number(NIE_PREFIX[id[0]] + id.slice(1, 8));
    return DNI_LETTERS[number % 23] === id[8];
  }

  if (CIF_RE.test(id)) {
    return isValidCifControl(id);
  }

  return false;
}

// Dígito de control del CIF: se suman los dígitos en posición impar y el doble de
// los de posición par (sumando las cifras del resultado si pasa de 9); el control
// es la decena superior menos esa suma.
function isValidCifControl(cif: string): boolean {
  const digits = cif.slice(1, 8);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[i]);
    if (i % 2 === 0) {
      // Posiciones pares (1ª, 3ª…): se duplica y se suman las cifras.
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  }
  const control = (10 - (sum % 10)) % 10;
  const last = cif[8];
  // Según el tipo de entidad el control es un dígito, una letra, o cualquiera de
  // los dos; aceptamos ambas formas equivalentes.
  return last === String(control) || last === 'JABCDEFGHI'[control];
}

export function IsSpanishTaxId(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSpanishTaxId',
      target: object.constructor,
      propertyName,
      options: {
        message: 'El NIF/NIE/CIF no es válido',
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && isValidSpanishTaxId(value),
      },
    });
  };
}
