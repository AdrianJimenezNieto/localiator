import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// La validación vive en el DTO y la aplica el ValidationPipe global (main.ts):
// toda entrada se valida y sanea (whitelist descarta props no declaradas) antes
// de llegar al controlador. Nunca confiamos en la validación del frontend.
export class RegisterDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254) // límite práctico de longitud de email (RFC 5321).
  email!: string;

  // Política de contraseña: mínimo 10 caracteres con al menos una letra y un
  // número. Moderada: frena las contraseñas triviales sin forzar reglas absurdas.
  // El tope de 72 evita problemas con límites de longitud del hashing.
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(72)
  @Matches(/[A-Za-z]/, {
    message: 'La contraseña debe contener al menos una letra',
  })
  @Matches(/[0-9]/, {
    message: 'La contraseña debe contener al menos un número',
  })
  password!: string;
}
