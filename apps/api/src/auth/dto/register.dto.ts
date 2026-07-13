import { IsEmail, MaxLength } from 'class-validator';
import { IsStrongPassword } from './password.decorator';
import { AntiBotDto } from './anti-bot.dto';

// La validación vive en el DTO y la aplica el ValidationPipe global (main.ts):
// toda entrada se valida y sanea (whitelist descarta props no declaradas) antes
// de llegar al controlador. Nunca confiamos en la validación del frontend.
// Hereda de AntiBotDto los campos honeypot/turnstile (tarea 05).
export class RegisterDto extends AntiBotDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254) // límite práctico de longitud de email (RFC 5321).
  email!: string;

  @IsStrongPassword()
  password!: string;
}
