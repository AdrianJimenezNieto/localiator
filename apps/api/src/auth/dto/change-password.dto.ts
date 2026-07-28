import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from './password.decorator';

// Cambio de contraseña ESTANDO logueado. A diferencia de ResetPasswordDto, NO
// hereda de AntiBotDto: el endpoint es privado (usuario ya autenticado), así que
// no lleva honeypot ni Turnstile; el rate limit + la reautenticación con la
// contraseña actual bastan (decisión 5 del plan).
export class ChangePasswordDto {
  // Reautenticación: se verifica contra el hash guardado aunque haya sesión
  // válida. Solo exigimos que venga (MinLength(1)); la política de fortaleza se
  // aplica a la NUEVA, no a la actual.
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  // Misma política que registro/reset (decorador compartido).
  @IsStrongPassword()
  newPassword!: string;
}
