import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// En login NO aplicamos la política de contraseña (longitud, letras/números): esa
// solo rige al crear/cambiar la contraseña. Aquí basta con validar que llegan un
// email y una cadena, para no rechazar por formato a quien tiene una contraseña
// antigua y, sobre todo, para no filtrar reglas por la respuesta.
export class LoginDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
