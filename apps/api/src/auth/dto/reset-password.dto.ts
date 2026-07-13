import { IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from './password.decorator';
import { AntiBotDto } from './anti-bot.dto';

// Hereda de AntiBotDto los campos honeypot/turnstile (tarea 05).
export class ResetPasswordDto extends AntiBotDto {
  // Token del enlace del email; su validez real se comprueba en el servicio.
  @IsString()
  @MinLength(1)
  token!: string;

  // Misma política que en el registro (decorador compartido).
  @IsStrongPassword()
  newPassword!: string;
}
