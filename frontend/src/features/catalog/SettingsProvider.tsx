import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import type { ClinicSettings } from './types';

const DEFAULTS: ClinicSettings = {
  clinicName: 'SIGO-Dental',
  timezone: 'America/Bogota',
  currency: 'USD',
  taxRatePercent: 12,
  opensAtMinute: 420,
  closesAtMinute: 1260,
  reminderHours: [48, 24],
  maxDiscountPercent: 10,
  noteLockHours: 24,
};

interface SettingsContextValue {
  settings: ClinicSettings;
  /** Vuelve a pedir los parámetros (tras editarlos en Administración). */
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({ settings: DEFAULTS, refresh: async () => undefined });

/** Parámetros de la clínica (moneda, impuesto, horario…) disponibles en toda la aplicación. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ClinicSettings>(DEFAULTS);

  const value = useMemo<SettingsContextValue>(() => {
    const refresh = async () => {
      try {
        setSettings(await api<ClinicSettings>('/catalog/settings'));
      } catch {
        /* se conservan los valores previos */
      }
    };
    return { settings, refresh };
  }, [settings]);

  useEffect(() => {
    void value.refresh();
    // solo al montar: el contexto se refresca explícitamente después
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
