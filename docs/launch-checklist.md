# Checklist de lanzamiento del MVP 🚀

Hito de cierre de la Fase 4 (tarea 12): abrir la web al público. **No es código**, es la
verificación de que todo lo anterior (Fases 1–4) está en producción, en verde y con
Stripe en modo **real**. Se completa la última.

> Estado: el trabajo de **código** de la Fase 4 está terminado y probado (tareas 01–11).
> Lo que queda es **manual** (VPS, DNS, claves live, verificación end-to-end). El
> checkbox «Lanzamiento del MVP» del `ROADMAP.md` se marca **solo cuando esta checklist
> esté verificada en producción con una compra real**. Los pasos manuales concretos están
> en `tasks/manual.md`.

## 1. Legal (tareas 01–04)
- [ ] Aviso legal, condiciones de venta, privacidad y cookies publicados y enlazados en el footer.
- [ ] Datos reales del titular en `apps/web/src/lib/legal.ts` (sin `[PENDIENTE]`).
- [ ] Textos con criterio jurídico revisados (sin `[PENDIENTE revisión legal]`).

## 2. Seguridad (tarea 05)
- [ ] `/security-review` sin hallazgos críticos.
- [ ] HTTPS/HSTS forzado en el reverse proxy; cookies `Secure` (`NODE_ENV=production`).
- [ ] Sin secretos en el repo; rate limiting y RBAC verificados.

## 3. Infraestructura (tareas 07–10)
- [ ] Backups automáticos con **restauración probada** en el VPS.
- [ ] Logs estructurados + trazabilidad de errores activos.
- [ ] Despliegue en el VPS por dominio con SSL (Let's Encrypt vía Nginx Proxy Manager).
- [ ] CD activo (`DEPLOY_ENABLED=true`) con **rollback probado**.

## 4. Vulnerabilidades (tarea 11)
- [ ] Dependabot + auditoría en CI activos, sin alertas críticas abiertas.

## 5. Stripe en producción
- [ ] Cambiar de claves **test** a **live** (`STRIPE_SECRET_KEY`).
- [ ] Dar de alta el **webhook de producción** y poner su `whsec_...` en `.env.production`.
- [ ] Verificar una **compra real de bajo importe** de punta a punta:
      pedido → pago → factura con IVA → email → estado de recogida.

## 6. SEO (tarea 06)
- [ ] `sitemap.xml` y `robots.txt` correctos (servidos en la raíz del dominio).
- [ ] Metadatos por página correctos.
- [ ] (Opcional) enviar el sitemap a Google Search Console.

## 7. Prueba de humo en producción
- [ ] Registro + verificación de email.
- [ ] Login (incluido Google).
- [ ] Compra completa.
- [ ] Panel de admin: cambio de estado de un pedido.
- [ ] Recepción de emails (Resend en producción, dominio verificado).

## 8. Copia previa y cierre
- [ ] **Backup previo** al lanzamiento y confirmación de que el rollback funciona.
- [ ] Lanzamiento «suave» (tráfico limitado / importes pequeños) antes de difundir.
- [ ] Marcar «**Lanzamiento del MVP**» en `ROADMAP.md`. Siguiente fase: subastas (Fase 5).
