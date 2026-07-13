import { Controller, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Borrado (anonimización) de la PROPIA cuenta. No lleva un id en la ruta: actúa
  // siempre sobre el usuario autenticado (@CurrentUser), así que es estructuralmente
  // imposible eliminar la cuenta de otra persona. Sin @Public, el JwtAuthGuard
  // global exige sesión válida.
  //
  // Throttle estricto: es una acción destructiva; limitamos el abuso/errores.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  deleteMe(@CurrentUser() user: RequestUser) {
    return this.users.anonymizeOwnAccount(user.userId);
  }
}
