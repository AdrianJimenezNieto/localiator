import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// Envoltorio fino sobre argon2 para aislar la librería del dominio: si algún día
// cambiamos de algoritmo, solo se toca este archivo. Además facilita mockearlo en
// tests.
//
// Se usa argon2id (variante recomendada actual): combina resistencia a ataques
// por GPU (argon2d) y a side-channels (argon2i). CLAUDE.md admite bcrypt o argon2;
// elegimos argon2 por ser el estándar más moderno.
@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  // Devuelve true/false. argon2.verify hace la comparación en tiempo constante,
  // así que no filtra información por timing al comparar el hash.
  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
