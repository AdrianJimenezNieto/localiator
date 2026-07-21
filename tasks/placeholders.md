# Placeholders pendientes de rellenar

Valores que hoy van con **placeholder** (o con claves de *test* públicas) y hay que
sustituir por los reales antes de abrir la web al público de verdad. Para cada uno se
indica **el fichero exacto** donde se cambia.

> Contexto: despliegue inicial en el VPS (`~/docker/webs/localiator`). Dominio canónico
> **`localiator.com`** (web) + **`api.localiator.com`** (API). Stripe en modo **test**.
> La web arranca y funciona sin estas claves salvo lo indicado en cada punto.

---

## 1. Datos legales del titular
**Fichero:** `apps/web/src/lib/legal.ts` (objeto `COMPANY`)

| Campo | Valor actual (placeholder) | Qué poner |
|-------|----------------------------|-----------|
| `legalName` | `[PENDIENTE: razón social / nombre y apellidos del titular]` | Razón social o nombre y apellidos del titular. |
| `taxId` | `[PENDIENTE: NIF/CIF]` | NIF o CIF. |
| `address` | `[PENDIENTE: domicilio fiscal completo]` | Domicilio fiscal completo. |
| `email` | `[PENDIENTE: email de contacto]` | Email legal (avisos, derechos RGPD, reclamaciones). |
| `registryInfo` | `[PENDIENTE si aplica: datos registrales de la sociedad]` | Solo si es sociedad; un autónomo lo deja vacío. |
| `LEGAL_LAST_UPDATED` | `'13 de julio de 2026'` | Fecha real de última revisión de los textos legales. |

> Estos textos se muestran en aviso legal, condiciones de venta, privacidad y en las
> facturas. **Requieren rebuild de la web** tras cambiarlos (Vite compila estático).
> `tasks/manual.md` recomienda revisión por un abogado antes del lanzamiento.

---

## 2. Datos fiscales del emisor de facturas
**Fichero:** `.env.production` (en el VPS, no versionado)

| Variable | Valor actual | Qué poner |
|----------|--------------|-----------|
| `INVOICE_ISSUER_NAME` | `"Localiator"` | Razón social del emisor (coherente con `legalName`). |
| `INVOICE_ISSUER_TAX_ID` | *(placeholder)* | NIF/CIF del emisor. |
| `INVOICE_ISSUER_ADDRESS` | *(placeholder)* | Domicilio fiscal del emisor. |

---

## 3. Stripe (pagos) — modo TEST
**Fichero:** `.env.production` (en el VPS)

| Variable | Valor actual | Qué poner |
|----------|--------------|-----------|
| `STRIPE_SECRET_KEY` | `sk_test_PLACEHOLDER` | Clave secreta de **test** de tu cuenta Stripe (`sk_test_...`). No existe una clave de test universal: es por cuenta. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_PLACEHOLDER` | Tras dar de alta el webhook en el dashboard de Stripe apuntando a `https://api.localiator.com/payments/webhook`, copiar su `whsec_...`. |

> **Sin estas claves el checkout no cobra** (el resto de la web funciona). Para pasar a
> producción real: cambiar a claves `sk_live_...` y webhook live (ver `tasks/manual.md`).

---

## 4. Google OAuth (login social)
**Fichero:** `.env.production` (en el VPS)

| Variable | Valor actual | Qué poner |
|----------|--------------|-----------|
| `GOOGLE_CLIENT_ID` | *(placeholder)* | Client ID de la app OAuth de Google. |
| `GOOGLE_CLIENT_SECRET` | *(placeholder)* | Client secret. |
| `GOOGLE_CALLBACK_URL` | `https://api.localiator.com/auth/google/callback` | Ya correcto; **darlo de alta como URI de redirección autorizada** en Google Cloud Console. |

> Sin esto, el **botón de Google falla**; el login/registro por email funciona igual.

---

## 5. Resend (email transaccional)
**Fichero:** `.env.production` (en el VPS)

| Variable | Valor actual | Qué poner |
|----------|--------------|-----------|
| `RESEND_API_KEY` | *(vacío)* | API key de Resend. |
| `MAIL_FROM` | `"Localiator <onboarding@resend.dev>"` | Remitente de un **dominio verificado** en Resend (p. ej. `no-reply@localiator.com`). |

> **Sin `RESEND_API_KEY` los emails se registran en el log en vez de enviarse** (verificación
> de email, reseteo de contraseña, confirmaciones). El resto funciona.

---

## 6. Cloudflare Turnstile (CAPTCHA) — claves de TEST públicas
**Ficheros:** `.env.production` (`TURNSTILE_SECRET_KEY`) y build-arg / `.env.production`
(`VITE_TURNSTILE_SITE_KEY`)

Ahora mismo se usan las **claves dummy oficiales de Cloudflare** que *siempre pasan*:

| Variable | Valor actual (test público) |
|----------|-----------------------------|
| `VITE_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` |

> Con estas claves el CAPTCHA **no protege de verdad** (siempre valida). Para protección
> real: crear un site en el dashboard de Turnstile con el dominio `localiator.com` y poner
> las claves reales. `VITE_TURNSTILE_SITE_KEY` es build-arg de la web → **requiere rebuild**.

---

## 7. Dominio `.es` (decisión de despliegue)
**Dónde:** Nginx Proxy Manager (lo configuras tú)

El build de la web hornea `VITE_API_URL=https://api.localiator.com`. Por la cookie de sesión
(`SameSite=Lax`, host-only) solo es *same-site* con `localiator.com`. Recomendado: servir
**`localiator.es` como redirección 301 → `https://localiator.com`** en NPM, en vez de como
front independiente (evita romper la sesión por cross-site).
