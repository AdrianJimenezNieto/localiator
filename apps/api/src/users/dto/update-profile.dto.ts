import { PickType } from '@nestjs/mapped-types';
import { RegisterDto } from '../../auth/dto/register.dto';

// Completar el perfil (nombre, nacimiento, dirección de facturación) de una
// cuenta que llegó sin esos datos, típicamente por login social. Reutiliza las
// mismas reglas de validación que el registro (misma edad mínima, mismo formato
// de código postal, etc.) sin arrastrar email/password/honeypot/turnstile, que
// no pintan nada en un PATCH de un usuario ya autenticado.
export class UpdateProfileDto extends PickType(RegisterDto, [
  'firstName',
  'lastName',
  'birthDate',
  'phone',
  'taxId',
  'addressLine1',
  'addressLine2',
  'postalCode',
  'city',
  'province',
  'country',
] as const) {}
