# Roadmap — Localiator

Documento de tracking del proyecto. **Se lee al inicio de cada sesión** para saber dónde
estamos y qué toca. Marcar `[x]` lo completado. Las decisiones cerradas están en
`CLAUDE.md`; las áreas por discutir en `preocupaciones.md`.

Decisión clave de alcance: **las subastas propias van en la Fase 2**, no en el MVP. Son la
parte más compleja (tiempo real, concurrencia, antisniping, bans) y no bloquean la venta
directa. El MVP es una tienda de venta directa con recogida en almacén.

---

## Reglas del repositorio (leer antes de tocar nada)

Trabajamos con **GitHub Flow**:

1. **`main` siempre estable y desplegable.** Nunca se commitea directamente sobre `main`.
2. **Una rama de feature por unidad de trabajo**, creada desde `main`:
   `feat/<breve-descripcion>`, `fix/<...>`, `chore/<...>`, `docs/<...>`.
3. **Commit tras cada paso (checkbox) del roadmap**, no al terminar la fase entera. Cada
   commit debe ser pequeño, humano y legible: un paso completado = uno o pocos commits que
   se entienden solos. Nada de "commit de fin de fase".
4. **Merge a `main` siempre vía Pull Request**, nunca merge local directo. La PR se revisa,
   pasa CI (lint + build + test en verde) y se mergea.
5. **Mensajes semánticos (Conventional Commits)** tanto en commits como en títulos de PR:
   `tipo(ámbito): descripción en imperativo`.
   - Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `style`.
   - Ámbitos habituales: `api`, `web`, `shared`, `db`, `ci`, `repo`.
   - Ejemplos: `feat(api): añadir endpoint de registro con verificación de email`,
     `chore(repo): configurar workspace pnpm`, `feat(db): modelar usuario y roles`.
6. **Marcar el checkbox del roadmap en el mismo commit** que completa ese paso, para que el
   historial y el tracking vayan sincronizados.
7. La rama se borra tras mergear la PR.

Regla práctica: si un paso del roadmap es grande, se puede partir en varios commits dentro
de su rama, pero cada commit sigue siendo coherente y con mensaje semántico.

---

## Fase 0 — Fundamentos del proyecto
Objetivo: repos, entornos y tooling listos para desarrollar con seguridad desde el día uno.

- [x] Inicializar repositorio git — **monorepo** con pnpm workspaces
- [x] Estructura de carpetas del backend (NestJS) y frontend (React + Vite + TS + Tailwind)
- [x] Configurar Prisma + conexión a PostgreSQL (Docker local) — verificado vía `/health`
- [x] `docker-compose.yml` de desarrollo (Postgres; apps en local con HMR)
- [x] Gestión de variables de entorno (`.env` fuera del repo, `.env.example` dentro)
- [x] Linter + formatter (ESLint + Prettier + oxlint) y convenciones de código
- [x] Configuración de tests (unit + e2e) y primer test humo
- [x] CI: lint + build + tests automáticos en cada push/PR (GitHub Actions)
- [~] Separación de entornos definida (dev listo; staging/producción se cierran en Fase 4)

## Fase 1 — Modelo de datos y autenticación
Objetivo: usuarios, roles y sesión seguros + esquema base de catálogo.

- [x] Esquema Prisma: Usuario + roles (invitado / comprador / administrador)
- [x] Esquema Prisma: Producto y Lote (entidades separadas, mismos atributos)
- [x] Esquema Prisma: Categoría
- [x] Esquema Prisma: tablas de auditoría (cambios de precio y stock)
- [x] Migraciones y seed de datos de prueba
- [x] Registro con verificación de email (Resend)
- [x] Login con email/contraseña (hashing argon2/bcrypt)
- [x] Login social (Google + un segundo proveedor)
- [x] Sesión con refresh token en cookie HttpOnly/Secure/SameSite + access token corto
- [x] Sliding expiration ~15 días por inactividad
- [x] Recuperación de contraseña
- [x] Guards de rol en cada endpoint (RBAC)
- [x] Rate limiting global + endpoints sensibles (login, registro, recuperación)
- [x] Cloudflare Turnstile (CAPTCHA invisible) + honeypot en formularios de auth

## Fase 2 — Catálogo y backoffice de admin
Objetivo: dar de alta productos/lotes y que se vean/filtren en la web.

- [x] CRUD de productos y lotes (solo admin)
- [x] Subida y gestión de fotos + estado real del artículo
- [x] Gestión de categorías
- [x] Registro de auditoría al cambiar precio/stock
- [x] Listado público de catálogo con paginación
- [x] Búsqueda y filtros (categoría, precio, estado)
- [x] Ficha de producto/lote (vista pública)
- [x] Diseño responsive del catálogo y ficha
- [x] Panel de administración (backoffice) básico

## Fase 3 — Carrito, pedidos y pagos (MVP de venta)
Objetivo: comprar de verdad. Cierre del MVP funcional.

- [x] Esquema Prisma: Pedido + líneas de pedido + estados (pendiente / pagado / listo para
      recoger / recogido / cancelado)
- [x] Carrito de compra
- [x] Reserva temporal de stock con expiración durante el checkout
- [x] Integración de pago con Stripe (Checkout / Payment Intents)
- [x] Webhook de Stripe: confirmar pedido al cobrar
- [x] Manejo de pago fallido / abandonado (liberar reserva de stock)
- [x] Conciliación pago recibido ↔ pedido registrado
- [x] Facturación automática con IVA tras el pago
- [x] Emails transaccionales de pedido (confirmación, cambios de estado)
- [x] Flujo de recogida en almacén (sin envíos)

## Fase 4 — Legal, cumplimiento y lanzamiento
Objetivo: poder abrir al público de forma legal y segura.

- [x] Aviso legal y condiciones de venta
- [x] Política de privacidad + RGPD (derecho al olvido)
- [x] Banner y política de cookies / consentimiento
- [x] Garantías legales al consumidor reflejadas en las condiciones
- [x] Revisión de seguridad: CSRF, XSS, inyección, secretos, HTTPS, cifrado en reposo
- [x] SEO básico (metadatos, sitemap, URLs amigables)
- [x] Backups automáticos de la base de datos
- [x] Logs centralizados + trazabilidad de errores en producción
- [x] Despliegue en VPS: Docker + Nginx Proxy Manager + SSL Let's Encrypt + dominio
- [x] CD con estrategia de rollback
- [x] Escaneo automático de vulnerabilidades en dependencias
- [ ] **Lanzamiento del MVP** 🚀 — pendiente solo del lanzamiento manual en producción
      (ver `docs/launch-checklist.md`); todo el código de la Fase 4 está terminado.

## Fase 5 — Subastas propias (post-MVP)
Objetivo: pujas en tiempo real sobre productos/lotes.

- [x] Esquema Prisma: Subasta, Puja, historial y ganador
- [x] Reglas de puja (incremento mínimo, precio de salida, cierre)
- [x] WebSockets (Gateway NestJS + Socket.IO) para pujas en vivo
- [x] Control de concurrencia (evitar condiciones de carrera en pujas casi simultáneas)
- [x] Antisniping: extensión automática del cierre a 5 min
- [x] Cierre automático de subasta y asignación de ganador
- [x] Impago del ganador: segunda oportunidad al siguiente + ban automático
- [x] Notificaciones en tiempo real (superado, ganado, a punto de cerrar)
- [x] Cobro del ganador vía Stripe reutilizando el flujo de pedidos
- [x] Apertura automática de subastas (`SCHEDULED` → `LIVE`)
- [x] CRUD de subastas (solo admin)
- [x] Listado público de subastas (API)
- [ ] Listado de subastas en la web + enlaces desde el catálogo
- [ ] Backoffice de subastas (alta, listado, cancelación)

## Backlog / futuro (sin fase asignada)
- [ ] Envíos con transportista (ahora solo recogida en almacén)
- [ ] SMS / push (además de email)
- [ ] Métricas de negocio (ventas, conversión, productos más vistos)
- [ ] Monitorización de uptime y alertas
- [ ] Plan de recuperación ante desastres
- [ ] Plan de respuesta ante incidentes
- [ ] Branding e identidad visual
