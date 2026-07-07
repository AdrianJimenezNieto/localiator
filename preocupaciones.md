 # Preocupaciones del proyecto

Lista de todo lo que tenemos que decidir/resolver, organizado por área. No se listan tecnologías salvo en los apartados ya cerrados.

## Tecnologías (decidido)
- Frontend: React + TypeScript + Tailwind.
- Backend: NestJS (Node + TypeScript).

## Modelado de datos
- Diferenciar entidad "lote" vs "producto individual" (un lote puede contener N productos, ¿o son independientes?).
- Qué atributos son comunes a todo (estado/condición, origen, precio de coste, ubicación en almacén, fotos) y cuáles son específicos de lote o de producto suelto.
- Cómo se modela el stock: ¿unidad única (no hay dos iguales, como en subastas de segunda mano) o cantidad agregable?
- Histórico de precios y cambios de precio por producto/lote.
- Relación con la plataforma de origen (John Pye u otras): guardar referencia al lote de compra original, fecha de compra, coste, gastos de transporte/aduanas asociados.
- Categorización/etiquetado de productos para búsqueda y filtrado.
- Modelado de pedidos: líneas de pedido, estados (pendiente, pagado, enviado, entregado, cancelado, devuelto).
- Modelado de usuarios/clientes y direcciones de envío/facturación.
- Si hay subastas propias: modelo de puja, historial de pujas, ganador, cierre automático, pujas automáticas/máximas.
- Versionado o auditoría de cambios en precios y stock (quién cambió qué y cuándo).

## Autenticación y control de sesión
- Roles: cliente comprador vs administrador/gestor de almacén (¿hay más roles?).
- Recuperación de contraseña, verificación de email.
- Duración y renovación de sesión, cierre de sesión en todos los dispositivos.
- Login social (Google, etc.) sí/no.
- Protección contra fuerza bruta y bots en login/registro.

## Seguridad
- Validación y saneamiento de toda entrada de usuario (frontend y backend).
- Gestión de secretos (claves de API, credenciales de BD, tokens de pago) y cómo se despliegan sin exponerlos.
- Control de acceso por rol en cada endpoint (que un cliente no pueda tocar rutas de admin).
- Protección contra ataques comunes: CSRF, XSS, inyección SQL/NoSQL, rate limiting, fuerza bruta.
- Cifrado de datos sensibles en tránsito (HTTPS obligatorio) y en reposo (datos personales, direcciones).
- Cumplimiento normativo: RGPD (datos de clientes europeos), política de privacidad, derecho al olvido.
- Política de contraseñas y almacenamiento seguro (hashing).
- Auditoría/logs de acciones sensibles (cambios de precio, cancelaciones, accesos de admin).
- Gestión de vulnerabilidades en dependencias (actualizaciones, escaneo automático).
- Plan de respuesta ante incidentes (qué hacer si hay una brecha de datos o fraude).

## Despliegue de la app
- Entorno de hosting para frontend, backend y base de datos.
- Separación de entornos: desarrollo, staging, producción.
- Integración continua / despliegue continuo (CI/CD): tests y build automáticos antes de publicar.
- Gestión de variables de entorno y configuración por entorno.
- Dominio propio, certificado SSL, DNS.
- Copias de seguridad de la base de datos y política de retención.
- Plan de recuperación ante desastres (caída del servidor, pérdida de datos).
- Monitorización de disponibilidad (uptime) y alertas.
- Logs centralizados y trazabilidad de errores en producción.
- Estrategia de rollback si un despliegue falla.
- Costes de hosting a medida que crece el catálogo/tráfico.

## Pasarela de pagos
- Qué métodos de pago se quieren aceptar (tarjeta, transferencia, otros).
- Gestión de reembolsos y cancelaciones desde el propio sistema.
- Conciliación entre pagos recibidos y pedidos registrados.
- Qué pasa si el pago falla a mitad del proceso (reserva de stock temporal, expiración).
- Comisiones de la pasarela y cómo repercuten en el margen.
- Cumplimiento normativo de pagos (PCI DSS) y quién asume esa responsabilidad.
- Facturación automática al cliente tras el pago.
- Moneda única o soporte multi-moneda.

## Lógica de subastas propias (si se implementa)
- Reglas de puja: incremento mínimo, puja automática/proxy, tiempo de cierre.
- Qué pasa con pujas en el último segundo (extensión automática del cierre tipo "antisniping").
- Notificación en tiempo real a los pujadores (superado, ganado, subasta a punto de cerrar).
- Qué ocurre si el ganador no paga (segunda oportunidad al siguiente pujador, penalización).
- Precio de salida, precio de reserva, compra directa opcional ("cómpralo ya").
- Concurrencia: evitar condiciones de carrera cuando varias pujas llegan casi a la vez.

## Inventario y logística de almacén
- Sincronización entre stock físico en almacén y stock mostrado en la web (evitar vender algo que ya no está).
- Proceso de alta de producto/lote nuevo comprado en plataformas como John Pye (quién lo introduce y cuándo).
- Gestión de fotos y estado real de cada artículo (muchos productos de subasta tienen desperfectos).
- Ubicación física en almacén para preparar pedidos.
- Reserva temporal de stock mientras un cliente está pagando.

## Envíos y postventa
- Cálculo de gastos de envío (por peso, volumen, destino).
- Integración o gestión manual con transportistas.
- Política de devoluciones y garantías (especialmente relevante en productos de segunda mano/subasta con desperfectos).
- Seguimiento de envío visible para el cliente.
- Atención al cliente: canal de contacto, gestión de incidencias/reclamaciones.

## Aspectos legales y fiscales
- Condiciones de venta y aviso legal publicados en la web.
- Facturación con IVA correcto según tipo de cliente/producto.
- Obligaciones fiscales derivadas de comprar en plataformas de subasta extranjeras (aduanas, IVA de importación).
- Política de cookies y consentimiento (RGPD/ePrivacy).
- Garantías legales al consumidor (derecho de desistimiento, productos de segunda mano).

## Búsqueda, catálogo y experiencia de usuario
- Filtros y búsqueda por categoría, precio, estado del producto.
- Paginación/rendimiento del catálogo si hay muchos productos.
- SEO para que los productos sean encontrables en buscadores.
- Diseño responsive/mobile, ya que muchos compradores de segunda mano compran desde el móvil.

## Notificaciones
- Email/SMS/push para confirmación de pedido, cambios de estado, subastas.
- Plantillas y proveedor de envío de emails transaccionales.

## Observabilidad y calidad
- Estrategia de testing (unitario, integración, end-to-end) y qué se cubre antes de cada release.
- Monitorización de errores en producción (frontend y backend).
- Métricas de negocio (ventas, conversión, productos más vistos) y cómo se recogen.

## Presupuesto y gestión de proyecto
- Coste estimado de cada servicio (hosting, pasarela de pago, emails, dominio) a distintos volúmenes de tráfico.
- Roadmap de fases: qué es MVP y qué se deja para después (¿subastas propias entran en el MVP o en fase 2?).
- Quién mantiene el proyecto a largo plazo (tiempo disponible, si hay más gente implicada).

## Branding e identidad
- Nombre definitivo del proyecto/tienda y disponibilidad de dominio.
- Identidad visual (logo, colores, tono de comunicación).
