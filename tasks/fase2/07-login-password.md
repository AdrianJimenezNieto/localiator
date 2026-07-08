# 07 · Login con email/contraseña (hashing argon2)

**Checkbox del roadmap:** «Login con email/contraseña (hashing argon2/bcrypt)».

## Objetivo
Autenticar usuarios con email y contraseña de forma segura: contraseñas hasheadas con
**argon2**, comparación resistente a timing y sin filtrar si el fallo fue por email o por
contraseña. Este archivo cubre la verificación de credenciales; la emisión de tokens de
sesión va en `09-sesion-tokens.md`.

## Qué se toca
- `apps/api/src/auth/` — servicio de hashing + endpoint de login.
- `package.json` de `api` — dependencia `argon2`.

## Cómo implementarlo
1. **Servicio de hashing.** Envolver `argon2` en un servicio (`hash(password)` /
   `verify(hash, password)`) con `argon2id` y parámetros por defecto de la librería
   (revisar que sean razonables para el VPS). Aislarlo permite cambiar de algoritmo sin
   tocar el resto.
2. **Uso en registro.** El registro (`06`) llama a `hash()` para poblar `passwordHash`.
3. **Endpoint `POST /auth/login`.** Recibe `email`, `password` (+ honeypot/Turnstile del
   `14`, protegido por rate limiting del `13`). Validar entrada con DTO.
4. **Verificación:**
   - Buscar usuario por email. Si no existe, **igualmente** ejecutar un `verify` contra un
     hash dummy para no revelar por *timing* que el email no existe.
   - Comparar con `argon2.verify`. Si falla, error **genérico** "credenciales inválidas"
     (mismo mensaje que email inexistente).
   - Comprobar `emailVerifiedAt` según la política decidida en `06`.
5. **Éxito:** delegar en el flujo de sesión (`09`) para emitir access + refresh tokens.
   Este endpoint NO decide el formato de los tokens, solo confirma identidad.
6. **Rehash oportunista (opcional):** si `argon2.needsRehash` indica parámetros viejos,
   rehashear al vuelo tras un login correcto. Anotar como mejora, no bloquear.

## Decisiones / alternativas
- **argon2id** (elegido) vs bcrypt: argon2id es el recomendado actual (resistente a GPU y a
  side-channels). `CLAUDE.md` admite ambos; se elige argon2.
- **Mensaje de error genérico + verify contra hash dummy:** evita enumeración de usuarios y
  ataques de timing. Alternativa (mensajes específicos) es más "amigable" pero insegura.
- **Hashing en servicio aislado:** desacopla la librería del dominio y facilita tests.

## Conceptos a repasar (para tus notas)
- Qué es un ataque de *timing* y por qué se verifica contra un hash dummy.
- Diferencia argon2id / argon2i / argon2d y por qué id.
- `needsRehash` y la estrategia de rehash oportunista.

## Hecho cuando
- Login verifica credenciales con argon2 y responde de forma uniforme ante fallos.
- No se puede distinguir "email no existe" de "contraseña incorrecta" (ni por mensaje ni por
  tiempo de respuesta).
- El registro guarda `passwordHash` con el mismo servicio.

## Al terminar (automatización)
Cuando esta tarea cumpla todos los criterios de «Hecho cuando»:
1. Marcar `[x]` el checkbox correspondiente en `ROADMAP.md`.
2. Hacer commit con mensaje semántico (Conventional Commits), incluyendo el cambio
   de `ROADMAP.md` en el **mismo commit** (regla 6 del repo).
