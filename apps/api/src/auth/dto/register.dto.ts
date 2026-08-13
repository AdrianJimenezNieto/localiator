import {
  IsEmail,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from './password.decorator';
import { IsSpanishTaxId } from './tax-id.decorator';
import { IsAdult } from './is-adult.decorator';
import { AntiBotDto } from './anti-bot.dto';

// La validación vive en el DTO y la aplica el ValidationPipe global (main.ts):
// toda entrada se valida y sanea (whitelist descarta props no declaradas) antes
// de llegar al controlador. Nunca confiamos en la validación del frontend.
// Hereda de AntiBotDto los campos honeypot/turnstile (tarea 05).
//
// Además de credenciales, el registro recoge los datos personales necesarios para
// facturar (dirección de facturación) e identificar al comprador. En BD son
// nullable, pero en el REGISTRO son obligatorios (salvo los marcados opcionales).
export class RegisterDto extends AntiBotDto {
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(254) // límite práctico de longitud de email (RFC 5321).
  email!: string;

  @IsStrongPassword()
  password!: string;

  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio' })
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1, { message: 'Los apellidos son obligatorios' })
  @MaxLength(100)
  lastName!: string;

  // NIF/NIE/CIF: OPCIONAL. Sin él la venta se documenta con factura SIMPLIFICADA,
  // válida en venta al por menor a particulares. Solo hace falta si el cliente
  // quiere factura completa (para deducirse el gasto).
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsSpanishTaxId()
  taxId?: string;

  // Fecha de nacimiento en formato ISO 'YYYY-MM-DD' (lo que produce un <input
  // type="date">). IsAdult exige mayoría de edad.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de nacimiento no es válida',
  })
  @IsAdult(18)
  birthDate!: string;

  // Teléfono OPCIONAL. Formato laxo: dígitos, espacios y un '+' inicial opcional.
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s]{6,20}$/, { message: 'El teléfono no es válido' })
  phone?: string;

  @IsString()
  @MinLength(1, { message: 'La dirección es obligatoria' })
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  // Código postal español: exactamente 5 dígitos. El negocio es solo España
  // (recogida en almacén), así que esta forma es suficiente.
  @Matches(/^\d{5}$/, { message: 'El código postal debe tener 5 dígitos' })
  postalCode!: string;

  @IsString()
  @MinLength(1, { message: 'La localidad es obligatoria' })
  @MaxLength(100)
  city!: string;

  @IsString()
  @MinLength(1, { message: 'La provincia es obligatoria' })
  @MaxLength(100)
  province!: string;

  // País en código ISO-3166 alpha-2 (p. ej. 'ES'). El frontend lo envía por
  // defecto como 'ES'.
  @IsISO31661Alpha2({ message: 'El país no es válido' })
  country!: string;
}
