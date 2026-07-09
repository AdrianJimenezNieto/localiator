import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from './session.service';

// Lo que queda en req.user tras validar el access token. Es la identidad en la
// que se apoya el RBAC (tarea 12).
export interface RequestUser {
  userId: string;
  email: string;
  role: string;
}

// Valida el access token (JWT) que el cliente envía en la cabecera
// Authorization: Bearer <token>. Passport verifica firma y caducidad ANTES de
// llamar a validate(); si algo falla, responde 401 automáticamente.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-insecure-secret',
    });
  }

  // No vamos a BD: confiamos en el JWT firmado (vida corta). El role viaja en el
  // token; si cambia, se propaga en el siguiente refresh (máx. la vida del access).
  validate(payload: AccessTokenPayload): RequestUser {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
