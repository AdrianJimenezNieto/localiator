import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './auth.constants';

// Marca una ruta como accesible sin autenticación (rol "invitado": catálogo,
// home, login, registro…). Como el JwtAuthGuard es global (denegar por defecto),
// SOLO lo marcado con @Public() queda abierto.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
