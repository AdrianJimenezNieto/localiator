// Antisniping (tarea 05): si llega una puja válida cuando quedan menos de estos
// minutos para el cierre, el cierre se mueve a `now + ventana`, dando siempre una
// ventana de reacción constante para responder. Umbral = extensión = 5 min según
// CLAUDE.md. Como constante (no número mágico repartido) para poder ajustarlo en
// un solo sitio y testear con valores pequeños.
export const ANTISNIPE_WINDOW_MINUTES = 5;
export const ANTISNIPE_WINDOW_MS = ANTISNIPE_WINDOW_MINUTES * 60_000;

// Plazo de pago del ganador (tarea 07): al cerrar con ganador se fija
// `paymentDueAt = now + esta ventana`. Si vence sin pago, el moroso es baneado y
// la subasta pasa al siguiente pujador con el plazo reiniciado. 48 h es un margen
// razonable para el MVP; como constante para ajustarlo en un sitio y testearlo con
// valores pequeños.
export const PAYMENT_WINDOW_HOURS = 48;
export const PAYMENT_WINDOW_MS = PAYMENT_WINDOW_HOURS * 60 * 60_000;
