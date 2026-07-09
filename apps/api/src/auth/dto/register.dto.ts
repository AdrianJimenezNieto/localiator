import { IsEmail, MaxLength } from 'class-validator';
import { IsStrongPassword } from './password.decorator';

// La validación vive en el DTO y la aplica el ValidationPipe global (main.ts):
// toda entrada se valida y sanea (whitelist descarta props no declaradas) antes
// de llegar al controlador. Nunca confiamos en la validación del frontend.
export class RegisterDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254) // límite práctico de longitud de email (RFC 5321).
  email!: string;

  @IsStrongPassword()
  password!: string;
}
