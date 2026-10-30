/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Minutos de inactividad antes de cerrar la sesión (máximo 15, RNF-05). */
  readonly VITE_IDLE_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
