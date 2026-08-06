import { useCallback, useEffect, useState } from 'react'

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

  // useCallback mantiene la misma referencia entre renders, para que el efecto de
  // abajo no tenga que desuscribir y volver a suscribir el listener cada vez.
  const close = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Si no se puede persistir, al menos lo cerramos en esta página.
    }
    setDismissed(true)
  }, [])

  // Cierre con Escape, lo esperable en cualquier diálogo. El listener va en
  // `document` (no en el modal) porque el foco puede estar en cualquier parte, y
  // la función de retorno lo quita al desmontar para no dejarlo colgado.
  useEffect(() => {
    if (dismissed) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismissed, close])

  // Los hooks van SIEMPRE antes de este return: React exige que se llamen en el
  // mismo orden en cada render, así que no pueden quedar detrás de una salida
  // temprana.
  if (dismissed) return null

  return (
    // El click en el fondo cierra. Va aquí y no en el panel porque el panel es
    // hijo: sin `stopPropagation` en él, cualquier click dentro burbujearía hasta
    // este handler y cerraría el modal sin querer.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="under-construction-title"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar aviso"
          className="absolute right-3 top-3 rounded-md p-1 text-xl leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-900"
        >
          ×
        </button>

        <h2
          id="under-construction-title"
          className="pr-8 text-lg font-bold text-ink-900"
        >
          Sitio en construcción
        </h2>
        <p className="mt-3 text-sm text-ink-700">
          Localiator todavía está en desarrollo. Puedes echar un vistazo, pero
          algunas funciones pueden no estar disponibles o cambiar, y los datos que
          veas son provisionales.
        </p>
        <p className="mt-2 text-sm text-ink-700">
          Gracias por tu paciencia: pronto estaremos listos.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={close}
            autoFocus
            className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
