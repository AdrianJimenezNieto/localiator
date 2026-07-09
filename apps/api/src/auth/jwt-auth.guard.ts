import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard que exige un access token válido. Protege rutas y deja req.user
// disponible. En la tarea 12 se registrará de forma global (denegar por defecto)
// junto al RolesGuard y el decorador @Public().
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
