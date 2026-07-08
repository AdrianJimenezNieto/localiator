# 14 · Cloudflare Turnstile + honeypot en formularios de auth

**Checkbox del roadmap:** «Cloudflare Turnstile (CAPTCHA invisible) + honeypot en formularios
de auth».

## Objetivo
Añadir dos defensas anti-bot complementarias en los formularios sensibles (registro, login,
recuperación): **Cloudflare Turnstile** (CAPTCHA invisible, decidido en `CLAUDE.md`) y un
**honeypot** (campo trampa). Van junto al rate limiting (`13`) como defensa en profundidad.

## Qué se toca
- Frontend (`apps/web/`): widget de Turnstile + campo honeypot oculto en los formularios de
  auth.
- Backend (`apps/api/src/auth/`): verificación del token de Turnstile y comprobación del
  honeypot (idealmente un guard/interceptor reutilizable).
- `.env` / `.env.example`: `TURNSTILE_SECRET_KEY` (backend) y la site key (frontend).

## Cómo implementarlo
### Turnstile
1. **Alta en Cloudflare:** crear un widget Turnstile, obtener *site key* (pública, frontend)
   y *secret key* (privada, backend, en `.env`).
2. **Frontend:** renderizar el widget en los formularios de registro/login/recuperación. Al
   enviar, incluir el token que genera Turnstile en el body de la petición.
3. **Backend:** antes de procesar la acción, verificar el token contra el endpoint de
   *siteverify* de Cloudflare (POST con la secret key + token + IP remota). Si no es válido →
   rechazar (`400`). Encapsular en un guard/servicio reutilizable para no repetir la lógica
   en cada endpoint.

### Honeypot
4. **Campo trampa:** añadir un input oculto por CSS (no `type=hidden`, sino visualmente
   oculto y fuera del tab order), con nombre que atraiga bots (p. ej. `website` o
   `nickname`). Un humano nunca lo rellena; muchos bots sí.
5. **Backend:** si el campo honeypot llega **con valor**, tratar la petición como bot y
   rechazarla (o fingir éxito sin hacer nada, para no dar pistas). Comprobación baratísima
   antes de tocar la BD.

## Decisiones / alternativas
- **Turnstile** (decidido) vs. reCAPTCHA/hCaptcha: Turnstile es gratuito, invisible y encaja
  con el principio de coste mínimo de `CLAUDE.md`.
- **Honeypot además de Turnstile:** son capas distintas (una analiza comportamiento, otra es
  una trampa trivial). Juntas + rate limiting cubren la mayoría de bots simples y avanzados.
- **Guard reutilizable** vs. verificación inline por endpoint: el guard evita duplicar y
  olvidar la verificación en algún formulario.
- **Fingir éxito** ante honeypot vs. error explícito: fingir éxito no informa al bot de que
  fue detectado; anotar cuál se elige.

## Conceptos a repasar (para tus notas)
- Qué es un CAPTCHA invisible y cómo verifica Turnstile en servidor (*siteverify*).
- Técnica del honeypot y por qué debe ocultarse con CSS (no `hidden`) y salir del tab order.
- Defensa en profundidad: Turnstile + honeypot + rate limiting como capas.
- Nunca confiar solo en validación de frontend: la verificación real es en backend.

## Hecho cuando
- Registro, login y recuperación exigen un token de Turnstile verificado en backend.
- El honeypot descarta envíos automáticos antes de tocar la BD.
- Site key en frontend y secret key en `.env`, fuera del repo.
