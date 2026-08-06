// Clases compartidas de la interfaz.
//
// Se exportan como cadenas en vez de como componentes <Button> a propósito: en la
// web conviven botones de verdad (<button>), enlaces del router (<Link>) y
// anclas normales (<a>), y envolver los tres en un componente obliga a inventar
// una prop `as` que complica más de lo que ahorra. Con una cadena, cada sitio usa
// la etiqueta correcta para su semántica y comparte el aspecto.
//
// La altura mínima de 44px en los botones no es estética: es el tamaño de destino
// táctil que recomienda la guía de accesibilidad para que se puedan pulsar con el
// dedo sin fallar.

const BTN_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50';

/** Acción principal de la pantalla. Solo debería haber una a la vista. */
export const btnPrimary = `${BTN_BASE} bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800`;

/** Acción secundaria: mismo peso visual, menos llamada. */
export const btnSecondary = `${BTN_BASE} border border-ink-300 bg-white text-ink-800 hover:border-ink-400 hover:bg-ink-50`;

/** Acciones de subasta (pujar). Naranja porque es el color de "esto corre". */
export const btnAccent = `${BTN_BASE} bg-accent-600 text-white shadow-sm hover:bg-accent-700 active:bg-accent-800`;

/** Terciaria, sin caja: para "cancelar", "volver" y similares. */
export const btnGhost = `${BTN_BASE} text-ink-600 hover:bg-ink-100 hover:text-ink-900`;

// Variantes para bloques de fondo oscuro (el CTA verde del inicio).
//
// Van como variantes propias y no como `${btnPrimary} bg-white text-brand-800`
// porque eso no funciona: btnPrimary ya trae `text-white`, y entre dos utilidades
// de la misma propiedad gana la que Tailwind coloque después en la hoja, no la
// que se escriba después en la cadena de clases. El resultado era texto blanco
// sobre botón blanco, es decir, botones en blanco.

/** Acción principal sobre fondo oscuro: botón claro, texto de marca. */
export const btnOnDark = `${BTN_BASE} bg-white text-brand-800 shadow-sm hover:bg-brand-50 active:bg-brand-100`;

/** Acción secundaria sobre fondo oscuro: contorno, texto blanco. */
export const btnOnDarkOutline = `${BTN_BASE} border border-white/35 text-white hover:border-white/60 hover:bg-white/10`;

/** Tarjeta contenedora estándar. */
export const card =
  'rounded-xl border border-ink-200 bg-white shadow-card';

/** Tarjeta que responde al puntero: se eleva un poco. */
export const cardInteractive = `${card} transition duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-card-hover`;

/** Campo de formulario. */
export const input =
  'min-h-11 w-full rounded-lg border border-ink-300 bg-white px-3 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25';

/** Etiqueta pequeña de estado. `tone` decide el color. */
export function badge(tone: 'neutral' | 'brand' | 'accent' | 'danger' = 'neutral') {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-100 text-brand-800',
    accent: 'bg-accent-100 text-accent-800',
    danger: 'bg-red-100 text-red-800',
  };
  return `inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`;
}

/** Ancho de página. Todas las pantallas comparten el mismo canal de lectura. */
export const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
