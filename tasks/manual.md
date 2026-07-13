# Tareas manuales — Localiator

Cosas que **debe hacer Adrián a mano** (fuera del código/repo): dar de alta cuentas, obtener
claves, configurar servicios externos o tomar decisiones fiscales. El código las asume hechas
vía `.env` (que **no** se commitea; `CLAUDE.md`).

Marca `[x]` según las completes.

---

## Fase 3 — Carrito, pedidos y pagos

### Stripe (pagos) — tareas 04, 05, 06, 08
- [ ] Crear cuenta en Stripe y activar el **modo test** (dashboard.stripe.com).
- [ ] Copiar la **clave secreta de test** (`sk_test_...`) a `STRIPE_SECRET_KEY` en `.env`.
- [ ] (Si se usa Checkout) revisar los métodos de pago activos (tarjeta; wallets/PayPal
      opcionales) en el dashboard.
- [ ] **Webhook local (dev):** instalar la **Stripe CLI** y ejecutar
      `stripe listen --forward-to localhost:3000/payments/webhook`. Copiar el
      `whsec_...` que imprime a `STRIPE_WEBHOOK_SECRET` en `.env`.
- [ ] **Webhook en staging/producción (Fase 4):** dar de alta el endpoint público del webhook
      en el dashboard de Stripe y poner su `whsec_...` en el `.env` del entorno.
- [ ] Probar el pago de punta a punta con **tarjetas de test** de Stripe
      (`4242 4242 4242 4242`, fecha futura, CVC cualquiera).

### Facturación con IVA — tarea 09
- [ ] Definir los **datos fiscales del emisor** (NIF/CIF, razón social, dirección) para las
      facturas.
- [ ] Confirmar el **tipo de IVA** aplicable (general 21 % por defecto) y si algún producto
      lleva tipo distinto.
- [ ] Decidir si los **precios del catálogo incluyen IVA o no** (afecta al desglose de la
      factura) y dejarlo dicho para la tarea 09.
- [ ] (Recomendado) validar con asesoría fiscal los requisitos formales de la factura y de la
      numeración correlativa. La formalización legal completa es de la Fase 4.

### Emails de pedido (Resend) — tarea 10
- [ ] Para enviar de verdad (no solo log): crear/usar la cuenta de **Resend** y poner
      `RESEND_API_KEY` en `.env`.
- [ ] **Verificar un dominio** en Resend y ajustar `MAIL_FROM` a una dirección de ese dominio.
      Sin dominio propio, `onboarding@resend.dev` sirve solo para pruebas.

> En desarrollo, sin `RESEND_API_KEY` los emails se **registran en el log** en vez de
> enviarse (comportamiento ya existente del `MailService`), así que se puede desarrollar la
> Fase 3 sin Resend configurado.

---

## Fase 4 — Legal, cumplimiento y lanzamiento

### Datos legales del titular — tareas 01, 02, 04
Rellenar en `apps/web/src/lib/legal.ts` (hoy con marcadores `[PENDIENTE]`). Sin estos datos
reales no se puede abrir al público (tarea 12 exige que no queden `[PENDIENTE]`).
- [ ] **Razón social / nombre y apellidos** del titular (persona física o jurídica).
- [ ] **NIF/CIF**.
- [ ] **Domicilio fiscal** completo.
- [ ] **Email de contacto** legal (para avisos, ejercicio de derechos RGPD, reclamaciones).
- [ ] **Datos registrales** (solo si el titular es una sociedad; un autónomo no los tiene).
- [ ] (Recomendado) revisar los textos legales con un abogado antes del lanzamiento; los
      puntos que requieren criterio jurídico están marcados `[PENDIENTE revisión legal]`.

### Backups de la base de datos — tarea 07
El código (`scripts/backup-db.sh`, `scripts/restore-db.sh`, `docs/backups.md`) está listo;
falta configurarlo en el VPS.
- [ ] Elegir y guardar una **`BACKUP_PASSPHRASE`** fuerte en el gestor de secretos (NO junto
      a los backups) y ponerla en el `.env` del VPS.
- [ ] Definir `BACKUP_DIR` en un disco/carpeta **fuera del volumen de la BD**.
- [ ] Dar de alta el **cron diario** en el VPS (ejemplo en `docs/backups.md`).
- [ ] Verificar el **cifrado en reposo** del disco/volumen del VPS (coherente con tarea 05).
- [ ] (Opcional) sincronizar una copia a almacenamiento externo sin coste.
- [ ] Re-probar la **restauración** en el VPS una vez configurado (el ciclo dump→restore ya
      se validó en desarrollo).

### Escaneo de vulnerabilidades — tarea 11
El código (Dependabot + `pnpm audit` en CI) está listo; falta activarlo en GitHub.
- [ ] Activar **Dependabot alerts** y **Dependabot security updates** en
      *Settings → Code security and analysis* del repo.
- [ ] (Si es gratis para el repo) activar **CodeQL** (análisis estático de seguridad).
- [ ] Revisar el primer lote de PRs de Dependabot cuando lleguen (mergear tras CI verde).

### Despliegue en el VPS — tarea 09
Los artefactos (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.prod.yml`,
`docs/deploy.md`) están listos y las imágenes se han probado en local. Falta lo del VPS:
- [ ] Apuntar el **dominio** (y subdominio de la API) por DNS a la IP del VPS.
- [ ] Crear el **`.env.production`** en el VPS (fuera del repo) con los secretos reales.
- [ ] Instalar/usar **Nginx Proxy Manager**; crear los Proxy Hosts y pedir **Let's Encrypt**
      con *Force SSL* + **HSTS**. Exponer `/sitemap.xml` y `/robots.txt` desde la raíz hacia
      la API (tarea 06).
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` y comprobar healthchecks.
- [ ] **Stripe en producción**: dar de alta el webhook público y poner su `whsec_...` en
      `.env.production` (ya anotado en la sección de Stripe; se cierra en la tarea 12).
- [ ] Probar una compra de extremo a extremo por HTTPS (Stripe test primero).

### CD y rollback — tarea 10
El workflow `.github/workflows/deploy.yml` está listo; faltan los secretos y una prueba.
- [ ] Clonar el repo en el VPS en `VPS_PROJECT_DIR` (p. ej. `/opt/localiator`) con `main`.
- [ ] Crear en GitHub (*Settings → Secrets and variables → Actions*):
      **Secrets** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PROJECT_DIR`;
      **Variable** `VITE_API_URL`.
- [ ] (Opcional) crear el *environment* `production` con **aprobación manual** para el deploy.
- [ ] Cuando el VPS y los secretos estén listos, poner la **Variable** `DEPLOY_ENABLED=true`
      para activar el CD (mientras no exista o sea distinto de `true`, el deploy no corre).
- [ ] Asegurar que el VPS puede hacer `docker login ghcr.io` / pull de las imágenes
      (paquetes públicos, o `docker login` con un PAT de solo lectura).
- [ ] **Probar el rollback** una vez: forzar un deploy que falle el health-check y verificar
      que vuelve a la release anterior (`.last_good_tag`).

### Lanzamiento del MVP — tarea 12
Todo el código de la Fase 4 está listo; el lanzamiento es la verificación final en
producción (ver la checklist completa en `docs/launch-checklist.md`).
- [ ] Completar los datos legales reales (sección «Datos legales del titular»).
- [ ] Desplegar en el VPS y activar el CD (secciones de las tareas 09 y 10).
- [ ] **Stripe a modo live**: `STRIPE_SECRET_KEY` real + webhook de producción (`whsec_...`).
- [ ] Verificar una **compra real de bajo importe** de punta a punta.
- [ ] Prueba de humo (registro, login social, compra, admin, emails de Resend en prod).
- [ ] Backup previo + rollback confirmado.
- [ ] Marcar «**Lanzamiento del MVP**» en `ROADMAP.md` una vez todo verificado en producción.
