import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Completar/editar los datos personales de la propia cuenta (p. ej. tras un
  // login con Google, o para corregir la dirección de facturación). Sin id en
  // la ruta: actúa siempre sobre @CurrentUser, igual que deleteMe.
  @Patch('me')
  updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateOwnProfile(user.userId, dto);
  }

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
