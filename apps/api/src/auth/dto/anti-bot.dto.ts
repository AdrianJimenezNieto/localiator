import { IsOptional, IsString, MaxLength } from 'class-validator';

// Campos que los formularios de auth envían para la protección antibot y que lee
// el AntiBotGuard: el honeypot `website` (debe llegar vacío; si un bot lo rellena,
// el guard lo caza ANTES del ValidationPipe) y el token de Cloudflare Turnstile.
//
// Se declaran aquí como OPCIONALES para que el ValidationPipe global (whitelist +
// forbidNonWhitelisted, tarea 05) no rechace la petición por traer campos "de más".
// Los DTOs de register/login/forgot/reset heredan de esta base.
export class AntiBotDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096) // un token de Turnstile ronda los ~2 KB; margen de sobra.
  turnstileToken?: string;
}
