import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getStoredConsent,
  storeConsent,
  type CookieChoice,
} from '../lib/cookieConsent'

// Banner de consentimiento de cookies. Aparece en la primera visita (o si cambia
// la versión del consentimiento) y ofrece Aceptar / Rechazar con la MISMA
// prominencia, como exige la normativa de la UE (rechazar tan fácil como aceptar).
//
// Hoy la web solo usa cookies técnicas/exentas (sesión, Turnstile), que no
// requieren consentimiento; el banner deja el marco listo para cuando entren
// cookies no esenciales (p. ej. analítica): entonces se cargarían SOLO tras
// aceptar.
export function CookieBanner() {
  // Inicializamos leyendo el estado ya guardado: si hay elección válida, el banner
  // no llega a montarse visible. useState con función evita releer en cada render.
  const [decided, setDecided] = useState<boolean>(() => getStoredConsent() !== null)

  if (decided) return null

  function choose(choice: CookieChoice) {
    storeConsent(choice)
    setDecided(true)
  }

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white shadow-lg"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-700">
          Usamos cookies técnicas necesarias para el funcionamiento del sitio. No
          activamos cookies no esenciales sin tu consentimiento. Más información en
          la{' '}
          <Link to="/cookies" className="underline hover:text-neutral-900">
            política de cookies
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose('rejected')}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  )
}
