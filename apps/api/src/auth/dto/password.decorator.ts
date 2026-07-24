import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Política de contraseña centralizada: mínimo 10 caracteres con al menos una
// letra, un número y un carácter especial (cualquier cosa que no sea letra ni
// dígito). Al vivir en un solo decorador, el registro (06) y el reseteo (11)
// comparten exactamente las mismas reglas; cambiarlas es un único sitio. El tope
// de 72 evita problemas con límites de longitud del hashing.
export function IsStrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(10, {
      message: 'La contraseña debe tener al menos 10 caracteres',
    }),
    MaxLength(72),
    Matches(/[A-Za-z]/, {
      message: 'La contraseña debe contener al menos una letra',
    }),
    Matches(/[0-9]/, {
      message: 'La contraseña debe contener al menos un número',
    }),
    // `[^A-Za-z0-9]` = cualquier carácter que no sea letra ni dígito: símbolos,
    // puntuación, espacios… Vale como "carácter especial".
    Matches(/[^A-Za-z0-9]/, {
      message: 'La contraseña debe contener al menos un carácter especial',
    }),
  );
}
