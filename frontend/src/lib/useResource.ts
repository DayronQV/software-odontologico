import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'No se pudo conectar con el servidor.';

/**
 * Carga un recurso de la API. Vuelve a cargar cuando cambia la identidad de `loader`
 * (memorícelo con useCallback) y descarta respuestas que llegan fuera de orden.
 */
export function useResource<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  const requestId = useRef(0);

  useEffect(() => {
    loaderRef.current = loader;
  });

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (id === requestId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === requestId.current) setState((s) => ({ ...s, error: errorMessage(error), loading: false }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, loader]);

  return { ...state, reload };
}
