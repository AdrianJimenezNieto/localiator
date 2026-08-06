// El búho de Localiator, redibujado como SVG a partir de docs/branding/logo-localiator.png.
//
// Por qué SVG y no el PNG original: se ve nítido en cualquier pantalla y a
// cualquier tamaño (el PNG es de 512px y en la cabecera se usa a 36px), pesa una
// fracción, y sobre todo permite recolorearlo. Los colores son los del logo pero
// desaturados, a juego con los tokens de index.css.
//
// `title` se pinta como <title> accesible cuando el logo va solo; cuando aparece
// junto al texto "Localiator" se pasa null para que un lector de pantalla no
// anuncie la marca dos veces seguidas.
export function Logo({
  className = 'h-9 w-auto',
  title = 'Localiator',
}: {
  className?: string;
  title?: string | null;
}) {
  return (
    <svg
      viewBox="0 0 68 40"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}

      {/* Cabeza: penachos arriba y dos mejillas redondeadas que se juntan abajo. */}
      <path
        d="M4.5 6C3 2.5 6 0.5 9.5 1.6C14 3 17 3.4 21 2.6C26 1.6 31 1.4 34 2.6C37 1.4 42 1.6 47 2.6C51 3.4 54 3 58.5 1.6C62 0.5 65 2.5 63.5 6C62 9.5 61.5 12 62 16C63 26 58 34 50 36.5C44 38.3 39 36.5 35.8 32.8C35 31.9 33 31.9 32.2 32.8C29 36.5 24 38.3 18 36.5C10 34 5 26 6 16C6.5 12 6 9.5 4.5 6Z"
        fill="var(--color-brand-400, #7cb862)"
        stroke="var(--color-ink-950, #141311)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />

      {/* Ojos: el rasgo que hace reconocible al búho, por eso van grandes. */}
      <circle
        cx="21"
        cy="17.5"
        r="9"
        fill="#ffffff"
        stroke="var(--color-ink-950, #141311)"
        strokeWidth="2.6"
      />
      <circle
        cx="47"
        cy="17.5"
        r="9"
        fill="#ffffff"
        stroke="var(--color-ink-950, #141311)"
        strokeWidth="2.6"
      />
      <circle cx="21" cy="17.5" r="4" fill="var(--color-ink-950, #141311)" />
      <circle cx="47" cy="17.5" r="4" fill="var(--color-ink-950, #141311)" />
      {/* Brillo: desplazado abajo-izquierda, como en el logo original. */}
      <circle cx="18.9" cy="19.4" r="1.5" fill="#ffffff" />
      <circle cx="44.9" cy="19.4" r="1.5" fill="#ffffff" />

      {/* Pico: el único naranja de la marca, para que el acento aparezca ya aquí. */}
      <path
        d="M34 12.8C36.6 14.4 37.2 19.6 35.6 24.8C34.9 27 33.1 27 32.4 24.8C30.8 19.6 31.4 14.4 34 12.8Z"
        fill="var(--color-accent-400, #e08a48)"
        stroke="var(--color-ink-950, #141311)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Logo + nombre. Es lo que va en la cabecera y el pie: el búho solo no dice
// todavía "Localiator" a quien llega por primera vez.
export function LogoWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Logo className="h-9 w-auto shrink-0" title={null} />
      <span className="font-heading text-xl font-semibold tracking-tight text-ink-900">
        Localiator
      </span>
    </span>
  );
}
