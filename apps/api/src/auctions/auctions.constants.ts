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

// Aviso "a punto de cerrar" (tarea 08): se avisa a los pujadores cuando faltan
// menos de estos minutos para `endsAt`. DELIBERADAMENTE MÁS CORTA que la ventana
// del antisniping (2 < 5 min): al extenderse el cierre reiniciamos el flag de
// "ya avisado" para poder reavisar, y si esta ventana fuese >= la del antisniping,
// tras cada extensión la subasta quedaría de inmediato dentro de rango y reavisaría
// en cada puja de último minuto (spam). Con 2 < 5, tras extender a `now + 5 min` el
// aviso no rearma hasta que la subasta vuelva a decaer a 2 min de calma.
export const ENDING_SOON_WINDOW_MINUTES = 2;
export const ENDING_SOON_WINDOW_MS = ENDING_SOON_WINDOW_MINUTES * 60_000;
