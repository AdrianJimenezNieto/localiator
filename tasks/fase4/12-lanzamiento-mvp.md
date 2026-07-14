# 12 · Lanzamiento del MVP 🚀

**Checkbox del roadmap:** «**Lanzamiento del MVP** 🚀».

## Objetivo
Hito de cierre de la Fase 4: **abrir la web al público**. No es una feature nueva sino una
**checklist de verificación** de que todo lo anterior (Fases 1–4) está en producción, en
verde y con Stripe en modo **real**. Esta tarea se completa la última.

## Qué se toca
- Nada de código nuevo por defecto; sí configuración de producción y verificación
  end-to-end. Cualquier fallo detectado se corrige en su tarea correspondiente.

## Checklist de lanzamiento
1. **Legal (tareas 01–04):** aviso legal, condiciones de venta, privacidad/derecho al olvido,
   cookies y garantías publicados, enlazados en el footer y con datos reales (sin
   `[PENDIENTE]`).
2. **Seguridad (tarea 05):** `/security-review` sin hallazgos críticos; HTTPS/HSTS forzado;
   sin secretos en el repo; rate limiting y RBAC verificados.
3. **Infra (tareas 07–10):** backups automáticos con restauración probada; logs + trazabilidad
   de errores activos; despliegue en el VPS por dominio con SSL; CD con rollback probado.
4. **Vulnerabilidades (tarea 11):** Dependabot y auditoría en CI activos, sin alertas
   críticas abiertas.
5. **Stripe en producción:** pasar de claves de test a **claves reales**, configurar el
   **webhook** de producción y verificar una compra real de bajo importe de principio a fin
   (pedido → pago → factura con IVA → email → estado de recogida).
6. **SEO (tarea 06):** `sitemap.xml` y `robots.txt` correctos; metadatos por página; enviar el
   sitemap a Search Console si se usa.
7. **Prueba de humo en producción:** registro + verificación de email, login (incluido social),
   compra completa, panel de admin y cambio de estado de un pedido, recepción de emails
   (Resend en producción).
8. **Copia de seguridad previa** al lanzamiento y confirmación de que el rollback funciona.

## Decisiones / alternativas
- **Lanzamiento «suave» vs. apertura total:** se recomienda un periodo de prueba con tráfico
  limitado (o Stripe con importes pequeños reales) antes de difundir, para cazar fallos con
  bajo riesgo.
- **Modo test → live de Stripe:** es el punto más delicado; hacerlo el último y verificar el
  webhook de producción, porque las claves y los eventos cambian respecto a test.

## Hecho cuando
- Toda la checklist está verificada en **producción** con una compra real completada de
  extremo a extremo.
- No quedan `[PENDIENTE]` legales ni alertas de seguridad/vulnerabilidad críticas.
- **La CI (lint + build + test) está en verde** y el último deploy es estable.

## Al terminar (flujo de entrega)
1. Marcar `[x]` el checkbox de lanzamiento en `ROADMAP.md` en el **mismo commit**.
2. Commit semántico (`chore(repo): lanzar MVP` o `docs(repo): ...`).
3. Con la **CI en verde** y el deploy estable, se cierra la **Fase 4** y el **MVP** queda
   público. Revisar el roadmap: lo siguiente es la Fase 5 (subastas propias).
