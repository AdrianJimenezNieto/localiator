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
