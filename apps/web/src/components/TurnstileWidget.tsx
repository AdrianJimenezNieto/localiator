import { useEffect, useRef } from 'react';

// Widget de Cloudflare Turnstile (CAPTCHA de casilla "no soy un robot"). Carga el
// script de Cloudflare una sola vez y renderiza el widget de forma EXPLÍCITA
// (render=explicit), para controlar cuándo aparece, poder resetearlo y limpiarlo
// al desmontar.
//
// El TIPO de widget (casilla visible, no interactivo, invisible) NO se decide
// aquí: se elige al crear el sitekey en el panel de Cloudflare ("Managed" da la
// casilla de clic). Este componente solo lo monta.
//
// Sin VITE_TURNSTILE_SITE_KEY (desarrollo), el widget no se renderiza y avisa al
// padre con token '' para no bloquear el formulario: en dev el backend tampoco
// exige token porque no hay TURNSTILE_SECRET_KEY (ver api/.../turnstile.service.ts).

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Tipado mínimo de la API global que inyecta el script de Cloudflare en `window`.
interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Carga el script UNA sola vez para toda la app (memorizamos la promesa). Resuelve
// cuando `window.turnstile` ya está disponible.
let scriptPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Turnstile'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  // Recibe el token cuando el usuario resuelve el CAPTCHA, o `null` cuando aún no
  // hay token válido (caducado, error, o pendiente de resolver).
  onVerify: (token: string | null) => void;
  // Cambiar este número (incrementarlo) fuerza un reset del widget. Útil tras un
  // envío fallido: el token de Turnstile es de un solo uso.
  resetKey?: number;
}

export function TurnstileWidget({ onVerify, resetKey = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  // Montaje del widget (una vez).
  useEffect(() => {
    // Sin sitekey (dev): no montamos nada y desbloqueamos el formulario con ''.
    if (!SITE_KEY) {
      onVerify('');
      return;
    }
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => onVerify(token),
          'expired-callback': () => onVerify(null),
          'error-callback': () => onVerify(null),
        });
      })
      .catch(() => onVerify(null));
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
    // onVerify es un setter de useState (estable); no lo metemos en deps para no
    // remontar el widget en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset a petición del padre (p. ej. tras un error de envío).
  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      onVerify(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!SITE_KEY) return null;
  // min-height reserva el hueco del widget para que el formulario no “salte” al
  // cargar el iframe de Cloudflare.
  return <div ref={containerRef} className="min-h-[65px]" />;
}
