import { useCallback, useState } from 'react';
import { api } from './api';
import { useResource } from './useResource';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

type FilterValue = string | boolean | undefined;

interface Options {
  pageSize?: number;
  filters?: Record<string, FilterValue>;
}

/** Arma ?a=1&b=2 omitiendo vacíos. */
export function buildQuery(params: Record<string, FilterValue | number>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

/**
 * Listado paginado con filtros. Al cambiar los filtros vuelve a la página 1
 * (sin efectos: la página guardada solo vale para el conjunto de filtros con el que se eligió).
 */
export function usePagedList<T>(path: string, { pageSize = 15, filters = {} }: Options = {}) {
  const filtersKey = JSON.stringify(filters);
  const [pageState, setPageState] = useState({ key: filtersKey, page: 1 });
  const page = pageState.key === filtersKey ? pageState.page : 1;
  const setPage = useCallback((next: number) => setPageState({ key: filtersKey, page: next }), [filtersKey]);

  const loader = useCallback(
    () => api<Paged<T>>(`${path}${buildQuery({ ...(JSON.parse(filtersKey) as Record<string, FilterValue>), page, pageSize })}`),
    [path, filtersKey, page, pageSize],
  );
  const resource = useResource(loader);
  return { ...resource, page, setPage, pageSize };
}
