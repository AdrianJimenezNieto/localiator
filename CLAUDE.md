# Localiator

Web para vender lotes y productos individuales adquiridos en plataformas de subastas
(John Pye u otras) y almacenados en un almacén propio. Los clientes pueden comprar y
(en el futuro) pujar a través de la web. Recogida en el almacén de origen; sin envíos de
momento.

Este documento es la fuente de verdad de las decisiones del proyecto. Las áreas aún por
discutir en detalle están en `preocupaciones.md`.

## Cómo colaborar conmigo

El objetivo no es solo que el código funcione, sino que **yo (Adrián) lo entienda**. Uso a
Claude como acelerador, no como muleta. Intensidad **moderada**: aplica estas reglas al
código no trivial (lógica de negocio, auth, pagos, subastas, decisiones de arquitectura);
en boilerplate repetitivo o config puedes ir más directo.

1. **Explica antes de picar.** En cambios no triviales, primero cuéntame en breve *qué* vas
   a hacer y *por qué*, y espera mi OK antes de escribir el código.
2. **Diffs pequeños y revisables.** Un paso = un diff que se lee de una sentada. Si un cambio
   es demasiado grande para entenderlo de una lectura, pártelo.
3. **No des por bueno lo que yo no sabría explicar.** Si el código tiene partes que
   probablemente no entienda, señálalas tú mismo y explícalas sin que tenga que pedirlo.
4. **Anímame a que te lo explique de vuelta.** Tras un cambio relevante, invítame a resumir
   con mis palabras qué hace; si detectas que no lo tengo claro, aclara el hueco al momento.
5. **Da el "por qué" y las alternativas**, no solo el código. En decisiones de diseño,
   menciona brevemente qué otras opciones había y por qué esta.
6. **Distingue lo que pico yo de lo que picas tú.** El núcleo que quiero aprender (auth,
   lógica de subastas, pagos) prefiero escribirlo yo con tu guía y revisión; el boilerplate
   aburrido puedes hacerlo tú. Si hay duda de en qué categoría cae algo, pregúntame.
7. **Señala conceptos a repasar.** Cuando aparezca algo que probablemente no domine (guards
   de NestJS, transacciones Prisma, JWT, WebSockets…), nómbralo para que lo apunte, aunque
   no lo estudiemos en el momento.

## Stack tecnológico (decidido)
- **Frontend**: React + TypeScript + Tailwind.
- **Backend**: NestJS (Node + TypeScript).
- **Despliegue**: VPS propio (ya pagado) con Docker (`Dockerfile` + `docker-compose.yml`),
  Nginx Proxy Manager como reverse proxy y SSL con Let's Encrypt.
- **Principio transversal de coste**: todo con tecnologías gratuitas o de coste mínimo.
  Nada de SaaS de pago recurrente salvo comisiones por transacción inevitables.

### Servicios y librerías (decidido)
- **Base de datos**: **PostgreSQL**, en el propio VPS vía Docker (transaccional — clave para
  pujas concurrentes y reservas de stock).
- **ORM/acceso a datos**: **Prisma**.
- **Tiempo real (subastas)**: WebSockets vía Gateways de NestJS (Socket.IO).
- **Pasarela de pago**: **Stripe** (único método; ver sección Pagos).
- **Email transaccional**: **Resend**.
- **CAPTCHA invisible**: **Cloudflare Turnstile**.

## Modelado de datos
- **Lote** y **producto individual** son entidades **separadas e independientes**: un lote
  NO contiene productos individuales. Se tratan como el mismo *tipo* de cosa (misma forma /
  atributos), pero sin relación de contención entre ellos.
- **Atributos** (comunes a lote y producto): nombre, descripción, precio, descuento, fotos,
  categoría.
- **Stock**: fijo sobre los productos ya en posesión. Diseñar dejando la puerta abierta a
  **añadir nuevos lotes en el futuro** (no bloquear ese caso, pero no es prioridad ahora).
- **Categorización**: sí, los productos van categorizados (base de la búsqueda/filtrado).
- **Pedidos**: con líneas de pedido y estados. Los productos se **recogen en el almacén de
  origen** (no hay envíos), así que los estados reflejan ese flujo (p. ej. pendiente,
  pagado, listo para recoger, recogido/entregado, cancelado).
- **Auditoría/versionado**: sí, registrar cambios en **precios y stock** (quién cambió qué
  y cuándo).
- **Descartado por ahora**: histórico de precios como funcionalidad de negocio, relación
  con la plataforma de origen (coste, transporte, aduanas), direcciones de envío.

## Autenticación y control de sesión
- **Roles**: `invitado` (sin cuenta, puede ver la web), `comprador`, `administrador`.
- **Recuperación de contraseña** y **verificación de email**: sí.
- **Sesión persistente estilo YouTube**: sesión recordada en el navegador mientras no se
  cambie de dispositivo ni se borre caché/sesión. **Caducidad por inactividad de ~15 días**
  (sliding expiration con refresh tokens): si no se usa en ese plazo, se cierra sola.
  **Refresh token en cookie `HttpOnly`** (además `Secure` y `SameSite`); el access token,
  de vida corta, en memoria.
- **Login social**: sí, **Google** y al menos otro proveedor, para facilitar login/registro
  al máximo.
- **Protección contra fuerza bruta y bots (innegociable)**: CAPTCHA invisible (Turnstile),
  honeypot, y rate limiting en toda la web / puntos sensibles (login, registro, recuperación,
  pujas, checkout).

## Seguridad
- Validación y saneamiento de **toda** entrada de usuario (frontend y backend).
- **Gestión de secretos** en `.env`, nunca commiteados al repo.
- **Control de acceso por rol en cada endpoint** (un comprador no puede tocar rutas de admin).
- Protección contra **todos** los ataques comunes: CSRF, XSS, inyección SQL/NoSQL, rate
  limiting, fuerza bruta.
- **Cifrado en tránsito (HTTPS obligatorio) y en reposo** (datos personales, sensibles).
- **Cumplimiento RGPD**: política de privacidad, derecho al olvido, cookies (si se usan).
- **Contraseñas**: hashing seguro (bcrypt/argon2), política de contraseñas.
- **Auditoría/logs** de acciones sensibles (cambios de precio, cancelaciones, accesos admin).
- **Gestión de vulnerabilidades en dependencias**: actualizaciones y escaneo automático.
- **Plan de respuesta ante incidentes**: fuera del MVP (se considera cosa de producción
  avanzada, menor prioridad de momento).

## Despliegue
- **Hosting**: VPS propio ya pagado (coste no es preocupación).
- **Separación de entornos**: fundamental (desarrollo / staging / producción).
- **CI/CD**: fundamental, con **tests y build automáticos antes de publicar**.
- **Contenedores**: `Dockerfile` + `docker-compose.yml`.
- **Dominio propio + SSL** con Let's Encrypt vía Nginx Proxy Manager en el VPS.
- **Copias de seguridad de la base de datos**: sí.
- **Logs centralizados** y trazabilidad de errores en producción: sí.
- **Estrategia de rollback** si un despliegue falla: sí.
- **Plan de recuperación ante desastres**: pendiente, a más largo plazo.

## Pasarela de pagos
- **Pasarela única**: **Stripe** (sin transferencia bancaria). Los métodos concretos
  (tarjeta, y opcionalmente wallets/PayPal si se activan vía Stripe) se ofrecen a través de
  Stripe.
- **Moneda única**: euros.
- **Objetivo de coste**: sin cuota fija, solo la comisión por transacción de Stripe.
- **Facturación automática** al cliente tras el pago.
- **Conciliación** entre pagos recibidos y pedidos registrados.
- **Fallo de pago a mitad de proceso**: plan definido (ligado a la reserva temporal de stock
  y su expiración — ver Inventario).
- **Reembolsos/cancelaciones**: mínimos. Al ser productos de subasta, se limita la
  responsabilidad al máximo dentro de lo legal.
- **Cumplimiento normativo de pagos (PCI DSS)**: delegar la responsabilidad en la pasarela
  (no manejar datos de tarjeta directamente).

## Subastas propias
- **Antisniping**: extensión automática del cierre a **5 minutos** ante pujas de último
  segundo.
- **Impago del ganador**: **segunda oportunidad** al siguiente pujador y **ban automático**
  al que no paga.
- **Notificaciones en tiempo real** a los pujadores: superado, ganado, subasta a punto de
  cerrar.
- **Concurrencia**: evitar condiciones de carrera cuando llegan varias pujas casi
  simultáneas (transacciones / bloqueos a nivel de BD).

## Inventario y almacén
- **Sincronización de stock físico**: no es una preocupación (almacén no ordenado).
- **Alta de producto/lote** nuevo comprado: proceso a definir (backoffice de admin).
- **Gestión de fotos y estado real** de cada artículo: sí (muchos con desperfectos).
- **Ubicación física**: no necesaria.
- **Reserva temporal de stock** mientras el cliente paga: sí (con expiración).

## Envíos y postventa
- **Sin envíos** de momento: los productos se **recogen en el almacén**.
- Postventa mínima. Se estudiará habilitar envíos en el futuro.

## Aspectos legales y fiscales
- **Condiciones de venta y aviso legal** publicados en la web.
- **Facturación con IVA correcto** según tipo de cliente/producto.
- **Política de cookies y consentimiento**: sí.
- **Garantías legales al consumidor**: sí.
- **Subasta extranjera / aduanas**: no aplica, todo comprado en España.

## Búsqueda, catálogo y UX
- **Filtros y búsqueda** por categoría, precio y estado del producto.
- **Paginación/rendimiento** del catálogo con muchos productos.
- **SEO** para que los productos sean encontrables en buscadores.
- **Diseño responsive 100%**.

## Notificaciones
- **Email / SMS / push** para confirmación de pedido, cambios de estado y subastas.
- **Emails transaccionales** con plantillas vía **Resend**.

## Observabilidad y calidad
- **Estrategia de testing** (unitario, integración, e2e) con cobertura definida antes de
  cada release.
- **Métricas de negocio** (ventas, conversión, productos más vistos).

## Presupuesto y gestión
- **Coste cero o mínimo** en la medida de lo posible: todo con tecnologías gratuitas.
  Infraestructura sobre el VPS ya pagado.

## Branding
- Sin prioridad de momento.
