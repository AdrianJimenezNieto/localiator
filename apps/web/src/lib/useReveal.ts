import { useEffect, useRef } from 'react';

// Aparición al hacer scroll, con IntersectionObserver nativo.
//
// Por qué así y no con una librería (GSAP/Framer Motion): son 200-500 KB para un
// efecto que el navegador ya sabe hacer. IntersectionObserver avisa cuando un
// elemento entra en pantalla y la animación en sí la hace CSS, así que corre en
// el hilo de composición y no bloquea nada.
//
// El movimiento es deliberadamente pequeño (14px) y corto (450ms): tiene que
// leerse como un fundido, no como algo que se desplaza. Una web de compras se
// visita muchas veces; una animación llamativa cansa a la tercera.

const OPTIONS: IntersectionObserverInit = {
  // Se dispara cuando al elemento le falta el 12% inferior de la ventana para
  // entrar, de modo que termina de aparecer justo cuando el ojo llega.
  rootMargin: '0px 0px -12% 0px',
  threshold: 0,
};

/**
 * Devuelve una ref para colgar de un contenedor. Todos los descendientes con la
 * clase `.reveal` aparecen al entrar en pantalla, escalonados entre sí.
 *
 * Se observa el contenedor una sola vez y se recorren sus hijos, en lugar de
 * montar un observer por tarjeta: con 12 productos en el catálogo eso serían 12
 * observers haciendo el mismo trabajo.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  {
    stagger = 60,
    watch,
  }: {
    stagger?: number;
    /**
     * Valor que, al cambiar, hace que se vuelvan a observar los hijos. Necesario
     * cuando el contenido llega de una petición o se repagina: los `.reveal` que
     * monta React después no existían cuando se creó el observer original.
     */
    watch?: unknown;
  } = {},
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
    if (items.length === 0) return;

    // Quien haya pedido menos movimiento en su sistema ve el contenido ya puesto.
    // Se comprueba aquí además de en el CSS porque así ni siquiera se crea el
    // observer.
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (reducedMotion) return;

    // El ocultado lo hace el JS, no el CSS: hasta esta línea el contenido está
    // visible. Así, si este código no llega a ejecutarse, la página se lee
    // igual (ver el comentario de .reveal-hidden en index.css).
    items.forEach((el) => el.classList.add('reveal-hidden'));

    const observer = new IntersectionObserver((entries) => {
      // El escalonado se calcula sobre el lote que entra a la vez, no sobre el
      // índice global. Así, si abres la página por la mitad (un enlace con
      // ancla, o recargas con scroll guardado), el retardo empieza en cero con
      // lo que estás viendo y no arrastra el de todo lo que quedó arriba.
      // El tope de 6 evita que una fila larga tarde un segundo en completarse.
      entries
        .filter((entry) => entry.isIntersecting)
        .forEach((entry, i) => {
          const el = entry.target as HTMLElement;
          el.style.animationDelay = `${Math.min(i, 6) * stagger}ms`;
          el.classList.add('reveal-in');
          el.classList.remove('reveal-hidden');
          observer.unobserve(el);
        });
    }, OPTIONS);

    items.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      // Al desmontar se devuelve todo a visible. Sin esto, un elemento que se
      // ocultó pero nunca llegó a entrar en pantalla podría quedarse invisible
      // si React lo reutiliza en otra vista.
      items.forEach((el) => el.classList.remove('reveal-hidden'));
    };
  }, [stagger, watch]);

  return ref;
}
