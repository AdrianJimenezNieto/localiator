// Antisniping (tarea 05): si llega una puja válida cuando quedan menos de estos
// minutos para el cierre, el cierre se mueve a `now + ventana`, dando siempre una
// ventana de reacción constante para responder. Umbral = extensión = 5 min según
// CLAUDE.md. Como constante (no número mágico repartido) para poder ajustarlo en
// un solo sitio y testear con valores pequeños.
export const ANTISNIPE_WINDOW_MINUTES = 5;
export const ANTISNIPE_WINDOW_MS = ANTISNIPE_WINDOW_MINUTES * 60_000;
