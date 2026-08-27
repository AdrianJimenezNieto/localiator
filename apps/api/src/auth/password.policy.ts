// Política de contraseñas de Localiator, en un único sitio.
//
// Vive fuera del decorador de class-validator porque no solo la usan los DTOs: el
// script de creación de administradores (src/scripts/create-admin.ts) se ejecuta
// FUERA de Nest y necesita aplicar exactamente las mismas reglas. Si vivieran solo
// dentro del decorador habría que duplicarlas, y dos copias de una regla de
// seguridad acaban divergiendo tarde o temprano.

export const PASSWORD_MIN_LENGTH = 10;
// El tope de 72 evita problemas con los límites de longitud del hashing.
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_MIN_LENGTH_MESSAGE = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
export const PASSWORD_MAX_LENGTH_MESSAGE = `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres`;

// Cada regla es un patrón que la contraseña DEBE cumplir, con el mensaje que se
// enseña si no lo hace. Los regex no llevan la bandera `g` a propósito: con `g`,
// `.test()` guarda estado entre llamadas (lastIndex) y daría falsos negativos al
// validar varias contraseñas seguidas.
export const PASSWORD_RULES = [
  {
    pattern: /[A-Za-z]/,
    message: 'La contraseña debe contener al menos una letra',
  },
  {
    pattern: /[0-9]/,
    message: 'La contraseña debe contener al menos un número',
  },
  // `[^A-Za-z0-9]` = cualquier carácter que no sea letra ni dígito: símbolos,
  // puntuación, espacios… Vale como "carácter especial".
  {
    pattern: /[^A-Za-z0-9]/,
    message: 'La contraseña debe contener al menos un carácter especial',
  },
];

// Valida una contraseña fuera de class-validator (scripts, CLI). Devuelve la lista
// de incumplimientos; un array vacío significa que la contraseña es válida.
export function validatePassword(password: string): string[] {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(PASSWORD_MIN_LENGTH_MESSAGE);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(PASSWORD_MAX_LENGTH_MESSAGE);
  }
  for (const rule of PASSWORD_RULES) {
    if (!rule.pattern.test(password)) {
      errors.push(rule.message);
    }
  }

  return errors;
}
