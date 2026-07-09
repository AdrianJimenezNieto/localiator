import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from './password.decorator';

export class ResetPasswordDto {
  // Token del enlace del email; su validez real se comprueba en el servicio.
  @IsString()
  @MinLength(1)
  token!: string;

  // Misma política que en el registro (decorador compartido).
  @IsStrongPassword()
  newPassword!: string;
}
