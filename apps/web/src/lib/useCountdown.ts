import { useEffect, useState } from 'react';

// Umbral a partir del cual la cuenta atrás se pinta como urgente (< 5 min). Coincide
// con la ventana de antisniping del backend, que es justo cuando pujar tiene efecto
// sobre el cierre.
const URGENT_MS = 5 * 60 * 1000;

export interface Countdown {
  label: string;
  urgent: boolean;
}

// Cuenta atrás hasta una fecha ISO. Es COSMÉTICA: la verdad del cierre la impone el
// servidor (el antisniping puede mover `endsAt`, y quien esté en la ficha lo recibe
// por WS con `auction:extended`). En el listado no hay WS, así que puede quedarse
// desfasada un momento; es aceptable porque pujar exige entrar en la ficha.
//
// Devuelve null cuando la fecha ya pasó: el llamador decide qué pintar (el estado
// real lo trae la API, no este hook).
export function useCountdown(targetIso: string): Countdown | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Un tick por segundo. Basta para una cuenta atrás y no castiga la batería en
    // una rejilla con muchas tarjetas.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = new Date(targetIso).getTime() - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;

  return { label: formatRemaining(remainingMs), urgent: remainingMs < URGENT_MS };
}

// Formato humano y corto: se queda en la unidad grande cuando falta mucho ("2 d")
// y baja al detalle cuando la cosa aprieta ("4:37"), que es cuando importa.
function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
