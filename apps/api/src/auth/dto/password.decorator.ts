import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_RULES,
} from '../password.policy';

// Política de contraseña centralizada: mínimo 10 caracteres con al menos una
// letra, un número y un carácter especial. Las reglas concretas viven en
// `password.policy.ts` para que las compartan el registro (06), el reseteo (11) y
// el script de creación de administradores, que corre fuera de Nest y por tanto no
// puede usar decoradores. Cambiar la política sigue siendo un único sitio.
export function IsStrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE }),
    MaxLength(PASSWORD_MAX_LENGTH),
    // Un `Matches` por cada regla del policy: misma lista, mismos mensajes.
    ...PASSWORD_RULES.map((rule) =>
      Matches(rule.pattern, { message: rule.message }),
    ),
  );
}
