import { useState } from 'react'

// Aviso de "sitio en construcción". Sale al entrar en la web pública y se puede
// cerrar para seguir navegando; queda recordado en sessionStorage, así que no
// reaparece al cambiar de página pero sí en una visita futura (mientras el sitio
// siga en obras, el recordatorio no debe ser eterno).
const STORAGE_KEY = 'localiator.underConstruction.dismissed'

export function UnderConstructionModal() {
  // Igual que en CookieBanner: leemos el estado guardado en el inicializador de
  // useState para no volver a tocar sessionStorage en cada render.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      // sessionStorage puede fallar (modo privado, cookies bloqueadas): en ese
      // caso mostramos el aviso, que es el comportamiento seguro.
      return false
    }
  })

  if (dismissed) return null

  function close() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Si no se puede persistir, al menos lo cerramos en esta página.
    }
    setDismissed(true)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="under-construction-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2
          id="under-construction-title"
          className="text-lg font-bold text-neutral-900"
        >
          Sitio en construcción
        </h2>
        <p className="mt-3 text-sm text-neutral-700">
          Localiator todavía está en desarrollo. Puedes echar un vistazo, pero
          algunas funciones pueden no estar disponibles o cambiar, y los datos que
          veas son provisionales.
        </p>
        <p className="mt-2 text-sm text-neutral-700">
          Gracias por tu paciencia: pronto estaremos listos.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={close}
            autoFocus
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
