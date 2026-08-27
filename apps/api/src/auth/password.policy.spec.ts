import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePassword,
} from './password.policy';

// La política la aplican dos caminos distintos (el decorador de los DTOs y el
// script de creación de administradores). Estos tests fijan las reglas para que un
// cambio accidental en una de las dos vías salte aquí.
describe('validatePassword', () => {
  it('acepta una contraseña que cumple todas las reglas', () => {
    expect(validatePassword('Localiator1!')).toEqual([]);
  });

  it('rechaza una contraseña demasiado corta', () => {
    const errors = validatePassword('Abc1!');
    expect(errors).toContainEqual(expect.stringContaining('al menos 10'));
  });

  it('rechaza una contraseña demasiado larga', () => {
    const errors = validatePassword('a1!'.repeat(PASSWORD_MAX_LENGTH));
    expect(errors).toContainEqual(expect.stringContaining('no puede superar'));
  });

  it('exige letra, número y carácter especial', () => {
    // Larga de sobra, pero solo dígitos: falla la letra y el especial.
    expect(validatePassword('1234567890')).toHaveLength(2);
    // Solo letras: falla el número y el especial.
    expect(validatePassword('abcdefghij')).toHaveLength(2);
    // Letras y número, sin especial.
    expect(validatePassword('abcdefghi1')).toHaveLength(1);
  });

  it('no arrastra estado entre llamadas', () => {
    // Los regex del policy no llevan la bandera `g` justamente por esto: con `g`,
    // `.test()` recuerda dónde acabó la búsqueda anterior y la segunda llamada
    // daría un falso negativo.
    const valid = 'Localiator1!';
    expect(validatePassword(valid)).toEqual([]);
    expect(validatePassword(valid)).toEqual([]);
  });

  it('acepta justo el mínimo de longitud', () => {
    const exact = 'a1!'.padEnd(PASSWORD_MIN_LENGTH, 'x');
    expect(exact).toHaveLength(PASSWORD_MIN_LENGTH);
    expect(validatePassword(exact)).toEqual([]);
  });
});
