import { Link } from 'react-router-dom'
import { COMPANY } from '../lib/legal'
import { LegalLayout, LegalSection } from '../components/LegalLayout'

// Política de cookies: qué cookies usa la web, para qué y durante cuánto. Hoy solo
// hay cookies técnicas/exentas; la tabla queda lista para ampliarla si en el futuro
// entran cookies no esenciales (analítica, etc.).
export function CookiesPage() {
  return (
    <LegalLayout title="Política de cookies">
      <p>
        Una cookie es un pequeño archivo que un sitio web guarda en tu navegador.
        En {COMPANY.brand} usamos únicamente las cookies necesarias para que la web
        funcione; no utilizamos cookies de publicidad ni de seguimiento.
      </p>

      <LegalSection title="Cookies que utilizamos">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-2 pr-4 font-semibold">Cookie</th>
                <th className="py-2 pr-4 font-semibold">Finalidad</th>
                <th className="py-2 pr-4 font-semibold">Duración</th>
                <th className="py-2 font-semibold">Titular</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-neutral-200">
                <td className="py-2 pr-4">Sesión (refresh token)</td>
                <td className="py-2 pr-4">
                  Técnica: mantener la sesión iniciada de forma segura.
                </td>
                <td className="py-2 pr-4">~15 días (renovable)</td>
                <td className="py-2">{COMPANY.brand}</td>
              </tr>
              <tr className="border-b border-neutral-200">
                <td className="py-2 pr-4">Cloudflare Turnstile</td>
                <td className="py-2 pr-4">
                  Técnica/seguridad: protección antibot en los formularios.
                </td>
                <td className="py-2 pr-4">Sesión</td>
                <td className="py-2">Cloudflare</td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Cookies técnicas y consentimiento">
        <p>
          Las cookies anteriores son <strong>técnicas o de seguridad</strong> y
          están exentas del deber de consentimiento, ya que son imprescindibles para
          prestar el servicio que solicitas (iniciar sesión, protegerte frente a
          bots). No instalamos ninguna cookie no esencial sin tu consentimiento
          previo.
        </p>
      </LegalSection>

      <LegalSection title="Cómo gestionar las cookies">
        <p>
          Puedes bloquear o eliminar las cookies desde la configuración de tu
          navegador. Ten en cuenta que desactivar las cookies técnicas puede impedir
          el correcto funcionamiento de la web (por ejemplo, no poder iniciar
          sesión). Para más información sobre el tratamiento de tus datos, consulta
          la{' '}
          <Link to="/privacidad" className="underline hover:text-neutral-900">
            política de privacidad
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
