import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Paginated } from '@localiator/shared';
import { apiGet, ApiError } from './api';

// Listado que crece por tandas ("scroll infinito"), sobre el mismo endpoint
// paginado que usa el paginador clásico. La diferencia con `useApi` es que aquí
// las respuestas se ACUMULAN en vez de reemplazarse.
//
// Por qué se guardan las tandas por separado (`chunks: T[][]`) y no en una sola
// lista a la que se hace push:
//
//   - Escribir `chunks[i] = respuesta` es idempotente. Si el efecto se ejecuta
//     dos veces con la misma tanda —cosa que pasa SIEMPRE en desarrollo, porque
//     <StrictMode> monta los efectos por duplicado a propósito— el resultado es
//     el mismo. Con `push` saldrían las tarjetas repetidas.
//   - Reintentar una tanda fallida sustituye esa tanda, no añade otra.
//
// El resto del hook es la misma prevención de condiciones de carrera que ya hay
// en useApi: la bandera `cancelled` descarta respuestas que llegan tarde.

interface Options {
  /** Artículos por tanda. */
  pageSize: number;
  /**
   * Tope de `pageSize` que acepta la API (MAX_PAGE_SIZE en el backend). Limita
   * cuántas tandas se pueden recuperar de golpe al volver a la página.
   */
  maxPageSize?: number;
  /**
   * Tandas a recuperar en la PRIMERA carga. Sirve para volver a un catálogo que
   * ya se había desplegado (al pulsar "atrás" desde una ficha, por ejemplo).
   * Solo se lee al montar: cambiarlo después no dispara nada.
   */
  initialBatches?: number;
}

export interface InfiniteResult<T> {
  items: T[];
  /** Total de artículos que hay tras los filtros (lo dice el backend). */
  total: number | null;
  /** Tandas completas ya pintadas. Es lo que se refleja en la URL. */
  loadedBatches: number;
  /** Primera carga: no hay nada que enseñar todavía. */
  loading: boolean;
  /** Ampliando por debajo de lo que ya está pintado. */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

// Estado interno. Va todo en un único objeto para poder reiniciarlo de una vez
// cuando cambian los filtros, sin dejar mezclados los artículos de la búsqueda
// anterior con el `total` de la nueva.
interface Acc<T> {
  /** Ruta (con filtros, sin paginación) a la que pertenecen estos artículos. */
  basePath: string;
  /** Tamaño de la primera tanda; las siguientes miden siempre `pageSize`. */
  firstSize: number;
  chunks: T[][];
  /** Cuántas tandas se han pedido. La última puede estar aún en vuelo. */
  requested: number;
  total: number | null;
  error: string | null;
  /** Sube al reintentar, para que el efecto vuelva a lanzarse. */
  attempt: number;
}

function freshAcc<T>(basePath: string, firstSize: number): Acc<T> {
  return {
    basePath,
    firstSize,
    chunks: [],
    requested: 1,
    total: null,
    error: null,
    attempt: 0,
  };
}

export function useInfiniteApi<T>(
  basePath: string,
  { pageSize, maxPageSize = pageSize, initialBatches = 1 }: Options,
): InfiniteResult<T> {
  // Cuántas tandas caben en una sola petición. La API tope el pageSize (60), así
  // que al volver con ?page=8 se recuperan las tandas que quepan, no las ocho.
  const [firstSize] = useState(() =>
    Math.min(Math.max(1, initialBatches) * pageSize, maxPageSize),
  );

  const [acc, setAcc] = useState<Acc<T>>(() => freshAcc<T>(basePath, firstSize));

  // Cambiaron los filtros → se vuelve a empezar por la tanda 1, y esta vez con
  // una tanda normal (el "paquete" grande solo tiene sentido al montar).
  //
  // Esto se hace DURANTE el render, no en un useEffect: es el patrón que
  // documenta React para ajustar estado cuando cambian las props. React descarta
  // este render y repite con el estado nuevo antes de pintar nada, así que no se
  // llega a ver la lista vieja ni se dispara una petición de más.
  if (acc.basePath !== basePath) {
    setAcc(freshAcc<T>(basePath, pageSize));
  }

  const { requested, chunks, total, error, attempt } = acc;
  const items = useMemo(() => chunks.flat(), [chunks]);
  const settled = chunks.filter(Boolean).length;
  const pending = settled < requested && error === null;

  useEffect(() => {
    const index = acc.requested - 1;
    // La tanda 0 puede ser un paquete de varias; el resto miden `pageSize`. El
    // desplazamiento se calcula en artículos y de ahí se saca el número de
    // página, que es lo que entiende la API (skip = (page - 1) * pageSize).
    const size = index === 0 ? acc.firstSize : pageSize;
    const offset = index === 0 ? 0 : acc.firstSize + (index - 1) * pageSize;
    const page = Math.floor(offset / size) + 1;
    const sep = acc.basePath.includes('?') ? '&' : '?';
    const path = `${acc.basePath}${sep}page=${page}&pageSize=${size}`;

    let cancelled = false;

    apiGet<Paginated<T>>(path)
      .then((res) => {
        if (cancelled) return;
        setAcc((prev) => {
          // La respuesta puede llegar cuando ya se han cambiado los filtros: en
          // ese caso pertenece a otra búsqueda y se tira.
          if (prev.basePath !== acc.basePath) return prev;
          const next = prev.chunks.slice();
          next[index] = res.items;
          return { ...prev, chunks: next, total: res.total, error: null };
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'No se pudo cargar';
        setAcc((prev) =>
          prev.basePath === acc.basePath ? { ...prev, error: message } : prev,
        );
      });

    return () => {
      cancelled = true;
    };
    // Cada combinación (ruta, tanda, reintento) se pide una vez.
  }, [acc.basePath, acc.requested, acc.firstSize, attempt, pageSize]);

  const hasMore = total !== null && items.length < total && error === null;

  // Pide la siguiente tanda. Se protege a sí misma dentro del setState porque
  // quien la llama es un IntersectionObserver, que puede dispararse varias veces
  // seguidas: si ya hay una petición en vuelo o no queda nada, no hace nada.
  const loadMore = useCallback(() => {
    setAcc((prev) => {
      const loaded = prev.chunks.filter(Boolean).length;
      if (loaded < prev.requested || prev.error !== null) return prev;
      const count = prev.chunks.flat().length;
      if (prev.total === null || count >= prev.total) return prev;
      return { ...prev, requested: prev.requested + 1 };
    });
  }, []);

  const retry = useCallback(() => {
    setAcc((prev) => ({ ...prev, error: null, attempt: prev.attempt + 1 }));
  }, []);

  return {
    items,
    total,
    loadedBatches: Math.ceil(items.length / pageSize),
    loading: pending && items.length === 0,
    loadingMore: pending && items.length > 0,
    error,
    hasMore,
    loadMore,
    retry,
  };
}
