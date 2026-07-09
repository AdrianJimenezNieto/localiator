import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from './jwt.strategy';

// Azúcar para leer req.user (lo pone JwtStrategy) sin manejar el Request a mano
// en cada handler. Uso: `me(@CurrentUser() user: RequestUser)`.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as RequestUser;
  },
);
