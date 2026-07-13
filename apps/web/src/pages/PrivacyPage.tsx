import { Link } from 'react-router-dom'
import { COMPANY } from '../lib/legal'
import { LegalLayout, LegalSection } from '../components/LegalLayout'

// Política de privacidad (RGPD). Texto estático: qué datos se tratan, con qué base
// legal y finalidad, quién los procesa (encargados de tratamiento) y cómo ejercer
// los derechos, incluido el derecho al olvido, que se autogestiona desde la página
// de cuenta (/cuenta).
export function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad">
      <p>
        En {COMPANY.brand} tratamos tus datos personales conforme al Reglamento
        (UE) 2016/679 (RGPD) y la normativa española de protección de datos. El
        responsable del tratamiento es {COMPANY.legalName} ({COMPANY.taxId}), con
        domicilio en {COMPANY.address}. Puedes contactar en {COMPANY.email}.
      </p>

      <LegalSection title="Qué datos recogemos">
        <ul className="ml-5 list-disc space-y-1">
          <li>Datos de cuenta: email y contraseña (cifrada).</li>
          <li>
            Datos de pedido: artículos comprados, importes, facturas y estado de
            recogida.
          </li>
          <li>
            Datos técnicos mínimos de seguridad (p. ej. IP para rate limiting y
            protección antibot).
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Con qué finalidad y base legal">
        <p>
          Tratamos tus datos para gestionar tu cuenta y tus compras (ejecución del
          contrato), emitir facturas y cumplir obligaciones fiscales (obligación
          legal) y proteger la web frente a fraude y abuso (interés legítimo).
        </p>
      </LegalSection>

      <LegalSection title="Durante cuánto tiempo">
        <p>
          Conservamos tus datos mientras tengas cuenta activa. Al eliminar tu
          cuenta, tus datos personales se anonimizan; no obstante, las{' '}
          <strong>facturas se conservan</strong> durante los plazos que exige la
          normativa fiscal, aunque ya no estén asociadas a datos que te
          identifiquen.
        </p>
      </LegalSection>

      <LegalSection title="Quién trata tus datos (encargados)">
        <p>Para prestar el servicio utilizamos proveedores que tratan datos por cuenta nuestra:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Stripe</strong> — procesamiento de pagos (no tenemos acceso a
            los datos de tu tarjeta).
          </li>
          <li>
            <strong>Resend</strong> — envío de correos transaccionales (verificación,
            pedidos).
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> — protección antibot de los
            formularios.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <p>
          Puedes ejercer los derechos de acceso, rectificación, supresión,
          oposición, limitación y portabilidad escribiéndonos a {COMPANY.email}.
          Además, puedes ejercer el <strong>derecho al olvido</strong> tú mismo
          eliminando tu cuenta desde{' '}
          <Link to="/cuenta" className="underline hover:text-neutral-900">
            tu cuenta
          </Link>
          . Si consideras que no hemos atendido correctamente tu solicitud, puedes
          reclamar ante la Agencia Española de Protección de Datos (AEPD).
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
