import { useCallback } from 'react';
import { api } from '../../lib/api';
import type { Paged } from '../../lib/usePagedList';
import { useResource } from '../../lib/useResource';
import type { Office, Procedure, Professional } from './types';

const ALL_ACTIVE = '?active=true&pageSize=200';

/** Consultorios activos con sus sillones (filtros de la agenda y formulario de citas). */
export function useOffices() {
  const loader = useCallback(
    async () => (await api<Paged<Office>>(`/catalog/offices${ALL_ACTIVE}`)).items,
    [],
  );
  return useResource(loader);
}

export function useProfessionals() {
  const loader = useCallback(
    async () => (await api<Paged<Professional>>(`/catalog/professionals${ALL_ACTIVE}`)).items,
    [],
  );
  return useResource(loader);
}

export function useProcedures() {
  const loader = useCallback(
    async () => (await api<Paged<Procedure>>(`/catalog/procedures${ALL_ACTIVE}`)).items,
    [],
  );
  return useResource(loader);
}
