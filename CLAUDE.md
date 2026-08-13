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

### Invariantes de seguridad (no romper sin pensarlo)
- **`JWT_ACCESS_SECRET` es obligatorio en producción.** Con `NODE_ENV=production`
  la API no arranca si falta, mide menos de 32 caracteres o es el fallback de
  desarrollo. Fuente única: `auth/jwt-secret.util.ts`; nadie debe volver a leer la
  variable directamente con un `|| 'dev-insecure-secret'`.
- **Nada de `$queryRawUnsafe` / `$executeRawUnsafe`.** Las consultas crudas (locks
  `FOR UPDATE`, contador de facturas) usan tagged templates, que parametrizan de
  verdad. Un test (`prisma/no-raw-sql.spec.ts`) falla si aparece una variante
  Unsafe en cualquier fichero.
- **El webhook de Stripe solo confirma si el cobro es real y cuadra.** Exige firma
  válida, `livemode` acorde al entorno, `payment_status === 'paid'` (una sesión
  "completada" NO es una sesión cobrada: los métodos asíncronos la completan sin
  dinero) e importe + moneda idénticos al total del pedido. Si algo no cuadra, se
  registra y NO se entrega: el dinero es recuperable, la mercancía no.
- **El importe siempre sale de la BD**, nunca de nada que mande el cliente.

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
- **La API corre en UNA sola instancia, y hoy eso es un requisito, no un detalle.**
  Tres cosas dependen de ello y se romperían en silencio (sin fallar, dando resultados
  incorrectos) si algún día se escala a varias réplicas:
  1. Las **rooms de Socket.IO viven en memoria**: con dos réplicas, un pujador
     conectado a la instancia A no recibiría los eventos emitidos por la B. Haría
     falta el adaptador de Redis de Socket.IO.
  2. El **rate limit de pujas del gateway** es un mapa en memoria: cada réplica
     tendría su propio cupo.
  3. Los **crons del ciclo de vida** (abrir, cerrar, impagos, aviso de cierre)
     correrían en todas las réplicas a la vez. Esto es lo único de los tres que ya
     está protegido: las cuatro operaciones son idempotentes y transaccionales con
     `SELECT … FOR UPDATE`, así que solaparse no duplica cierres ni bans.
  El `docker-compose.prod.yml` fija `container_name`, lo que impide escalar sin
  tocarlo: es la salvaguarda de facto que hace que el requisito se cumpla hoy.

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
- **Reembolsos y disputas (chargebacks)**: los gestiona el webhook a partir de
  `charge.refunded`, `charge.dispute.created` y `charge.dispute.closed`. Reglas:
  - Un reembolso **parcial** no cambia el estado (la venta sigue viva); solo el
    **total** lleva el pedido a `REFUNDED`. El importe devuelto vive en
    `Order.refundedCents`, que guarda el **acumulado** que manda Stripe (no el
    delta), de donde sale la idempotencia.
  - Una disputa pasa el pedido a `DISPUTED` y **guarda el estado previo**
    (`preDisputeStatus`): al ganarla se restaura ese estado, no `PAID`, para no
    devolver a la cola del almacén un pedido que el cliente ya recogió. Al
    perderla, el pedido queda `REFUNDED`.
  - **Nunca se repone stock automáticamente.** Un reembolso no prueba que el
    artículo haya vuelto al almacén; reponerlo a ciegas provocaría sobreventa. Lo
    hace el admin cuando recibe la devolución física.
  - `REFUNDED` y `DISPUTED` **no son fijables desde el backoffice** (409): el
    estado del dinero lo dicta Stripe.
  - Una disputa se avisa por email a `ADMIN_ALERT_EMAIL` y con log de nivel
    `error`: hay plazo de respuesta y dejarlo pasar pierde importe y mercancía.
- **PENDIENTE — factura rectificativa**: un reembolso obliga legalmente a emitir
  una factura rectificativa con su propia serie correlativa. Hoy **no se genera**;
  el webhook solo deja un aviso en el log para emitirla a mano.
- **Cumplimiento normativo de pagos (PCI DSS)**: delegar la responsabilidad en la pasarela
  (no manejar datos de tarjeta directamente).

## Subastas propias
- **Antisniping**: extensión automática del cierre a **3 minutos** ante pujas de último
  segundo. (Antes eran 5; se bajó a 3 para que una subasta muy disputada no se alargue
  indefinidamente.) La ventana del aviso "a punto de cerrar" debe seguir siendo **menor**
  que esta, o cada extensión volvería a disparar el aviso en bucle.
- **Puja proxy (puja automática por máximo)**: el usuario introduce el **máximo** que está
  dispuesto a pagar, no el importe a pujar. El sistema puja en su nombre lo mínimo
  necesario para ir en cabeza y va subiendo automáticamente, salto mínimo a salto mínimo,
  cuando otro le disputa, **sin pasar nunca de su máximo**. Si dos usuarios tienen máximo,
  gana el más alto pagando lo justo para superar al segundo; **un empate lo gana quien
  puso su máximo primero**.
  - El **máximo del líder en pie es privado**: no se emite jamás por el canal en vivo ni
    aparece en el historial. Es el dato crítico del sistema: quien lo conociera ganaría
    por un céntimo. Solo se publica el precio efectivo actual.
    - Matiz deliberado: lo que un pujador **ya batido** llegó a comprometer **sí** es
      público en el historial, porque es el registro veraz de la subasta y es lo único
      que explica por qué el proxy del líder subió el precio solo. Mismo criterio que
      eBay, y no es explotable: ese usuario ya está fuera y, si vuelve, fija un máximo
      nuevo. Fijado con un test e2e de regresión que cubre las dos mitades de la regla.
  - **Notificación de "te han superado" solo cuando se supera el MÁXIMO**, no en cada
    subida automática dentro del propio techo.
- **Impago del ganador**: **segunda oportunidad** al siguiente pujador y **ban automático**
  al que no paga.
- **Notificaciones en tiempo real** a los pujadores: superado, ganado, subasta a punto de
  cerrar. Respaldadas por email (Resend) para que lleguen con la pestaña cerrada.
- **Concurrencia**: evitar condiciones de carrera cuando llegan varias pujas casi
  simultáneas (transacciones / bloqueos a nivel de BD).
- **PENDIENTE — pago de la subasta**: el cobro del ganador está **implementado** (al cerrar
  se crea el pedido PENDING con reserva de stock y se cobra por el flujo Stripe existente),
  pero **queda pendiente validarlo end-to-end con claves reales de Stripe**. Está **fuera
  del alcance** del trabajo de subastas en tiempo real; se aborda como tarea aparte.

## Inventario y almacén
- **Sincronización de stock físico**: no es una preocupación (almacén no ordenado).
- **Alta de producto/lote** nuevo comprado: proceso a definir (backoffice de admin).
- **Gestión de fotos** de cada artículo: sí (muchos con desperfectos). Sin campo de estado/condición
  del artículo (nuevo, aceptable, etc.): descartado por decisión de negocio.
- **Ubicación física**: no necesaria.
- **Reserva temporal de stock** mientras el cliente paga: sí (con expiración).

## Envíos y postventa
- **Sin envíos** de momento: los productos se **recogen en el almacén**.
- Postventa mínima. Se estudiará habilitar envíos en el futuro.

## Aspectos legales y fiscales
- **Condiciones de venta y aviso legal** publicados en la web.
- **Facturación con IVA correcto** según tipo de cliente/producto.
- **Normativa aplicable: ESTATAL, no autonómica.** La facturación y el IVA se rigen
  por el RD 1619/2012 y la Ley 37/1992. Aragón es territorio común: regula IRPF
  autonómico, Sucesiones e ITP/AJD, pero **no** la facturación. (Solo País Vasco y
  Navarra tienen normativa foral propia por Concierto/Convenio Económico.)
- **Régimen de IVA: REBU** (régimen especial de bienes usados, arts. 135-139 LIVA),
  configurable con `INVOICE_REGIME`. Consecuencias en el documento:
  - El IVA se liquida sobre el **margen**, no sobre el precio de venta.
  - La factura **NO desglosa base ni cuota**: solo el total, más la mención legal
    obligatoria del régimen (art. 6.1.j RD 1619/2012). Que el cliente no vea IVA
    **no es un bug**: es el requisito.
  - El desglose (`netCents`/`vatCents`/`vatRateBps`) es nullable y solo se rellena
    en régimen general.
  - **Pendiente**: liquidar por margen exige el **precio de compra** de cada
    artículo, que hoy NO se modela (CLAUDE.md descartó el coste de origen). Hace
    falta para el libro registro y el modelo 303, aunque no para el documento que
    ve el cliente. Consultar con el gestor si procede margen operación a operación
    o **margen global** (más habitual cuando se compra por lotes).
- **Tipo de documento según los datos del cliente**: con NIF se emite factura
  **completa** (identifica al destinatario); sin NIF, **simplificada**, válida en
  venta al por menor hasta 3.000 € IVA incluido. Por encima de ese tope sin datos
  fiscales se emite igualmente pero se registra un `error`: mejor un documento
  incompleto que un pedido cobrado sin ninguno.
- **Rectificativas** (art. 15): serie propia `R`, numeración independiente,
  importes en **negativo** y motivo impreso. Las emite el webhook automáticamente
  ante un reembolso (por el importe de ESA operación, no el acumulado) y ante una
  disputa perdida.
- **La factura es un snapshot inmutable**: copia emisor, cliente y líneas al
  emitirse. No es purismo — el derecho al olvido vacía nombre y dirección del
  `User`, y el emisor sale de `.env`; sin snapshot, ejercer el RGPD o tocar una
  variable reescribía facturas ya emitidas.
- **PENDIENTE — VERI\*FACTU (RD 1007/2023 y RD 254/2025)**: registro de facturación
  encadenado por huella, inalterabilidad, QR y declaración responsable del
  software. **No implementado.** Las fechas de entrada en vigor (1-1-2026
  sociedades, 1-7-2026 resto) ya han pasado; verificar el estado real en la AEAT,
  porque se han prorrogado varias veces.
- **Política de cookies y consentimiento**: sí.
- **Garantías legales al consumidor**: sí.
- **Subasta extranjera / aduanas**: no aplica, todo comprado en España.

## Búsqueda, catálogo y UX
- **Filtros y búsqueda** por categoría y precio.
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
