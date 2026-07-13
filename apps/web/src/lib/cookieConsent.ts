// Estado del consentimiento de cookies, persistido en localStorage.
//
// Por qué localStorage y no una cookie: recordar la elección no requiere enviarla
// al servidor y así evitamos crear otra cookie (que a su vez habría que declarar).
// Guardamos la VERSIÓN del consentimiento: si en el futuro cambian las cookies
// usadas, subimos CONSENT_VERSION y el banner vuelve a pedir permiso.

export type CookieChoice = 'accepted' | 'rejected'

type StoredConsent = {
  choice: CookieChoice
  version: number
  timestamp: string
}

// Subir este número invalida los consentimientos anteriores y reabre el banner.
export const CONSENT_VERSION = 1

const STORAGE_KEY = 'localiator.cookie-consent'

// Devuelve la elección vigente, o null si no hay una válida para la versión actual
// (nunca dada, o dada para una versión anterior de las cookies).
export function getStoredConsent(): CookieChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConsent
    if (parsed.version !== CONSENT_VERSION) return null
    return parsed.choice
  } catch {
    // localStorage inaccesible (modo privado, etc.) o JSON corrupto: tratamos
    // como "sin consentimiento" y el banner se mostrará.
    return null
  }
}

export function storeConsent(choice: CookieChoice): void {
  const value: StoredConsent = {
    choice,
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Si no se puede persistir, no rompemos la navegación; el banner reaparecerá
    // en la siguiente visita, que es el comportamiento seguro (no asumir opt-in).
  }
}
