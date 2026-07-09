import { useEffect, useState } from 'react';
import { apiGet, ApiError } from './api';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  // Código HTTP del error (p. ej. 404), para que la UI distinga "no existe" de un
  // fallo genérico. null si no hubo error o no fue un ApiError.
  status: number | null;
  loading: boolean;
}

// Hook mínimo de fetching: pide `path` a la API y expone {data, error, loading}.
// Se re-ejecuta cada vez que cambia `path`, así que basta con reflejar filtros y
// página en la URL y construir el path desde ahí para que los datos se refresquen
// solos (base de las tareas 09/10). El flag `cancelled` evita actualizar el estado
// si el componente se desmonta o el path cambia antes de que llegue la respuesta
// (condición de carrera clásica).
export function useApi<T>(path: string): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    status: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    apiGet<T>(path)
      .then((data) => {
        if (!cancelled)
          setState({ data, error: null, status: null, loading: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'No se pudo cargar';
        const status = err instanceof ApiError ? err.status : null;
        setState({ data: null, error: message, status, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
