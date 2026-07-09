import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  // El token viaja en el enlace del email. Solo comprobamos que sea una cadena no
  // vacía; su validez real (existe, no caducado, no usado) se resuelve en el
  // servicio contra la BD.
  @IsString()
  @MinLength(1)
  token!: string;
}
