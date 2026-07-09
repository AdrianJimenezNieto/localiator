import { useCallback, useEffect, useState } from 'react';
import { apiGet, ApiError } from './api';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Como useApi, pero envía el token de acceso y expone un `reload()` para volver a
// pedir los datos tras una mutación (crear/editar/borrar en el backoffice).
export function useAuthedData<T>(path: string, token: string | null) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    apiGet<T>(path, token ?? undefined)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError ? err.message : 'No se pudo cargar';
        setState({ data: null, error: message, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [path, token, reloadKey]);

  return { ...state, reload };
}
