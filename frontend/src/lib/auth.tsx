import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, onSessionExpired, refreshTokens, tokens } from './api';
import type { Role } from './roles';

/**
 * loading → restaurando sesión · anonymous → sin sesión · mfa_setup → primer ingreso (configurar MFA)
 * · mfa_verify → falta el segundo factor · recovery_codes → mostrar códigos tras el enrolamiento
 * · authenticated → sesión completa (MFA verificado).
 */
export type Phase =
  | 'loading'
  | 'anonymous'
  | 'mfa_setup'
  | 'mfa_verify'
  | 'recovery_codes'
  | 'authenticated';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface MfaSetupData {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthContextValue {
  phase: Phase;
  user: SessionUser | null;
  recoveryCodes: string[];
  /** Aviso a mostrar en el login (p. ej. "su sesión expiró"). */
  notice: string | null;
  login: (email: string, password: string) => Promise<void>;
  setupMfa: () => Promise<MfaSetupData>;
  enableMfa: (code: string) => Promise<void>;
  verifyMfa: (input: { code?: string; recoveryCode?: string }) => Promise<void>;
  acknowledgeRecovery: () => void;
  logout: (notice?: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  keepAlive: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = useCallback((message?: string) => {
    tokens.clear();
    setUser(null);
    setRecoveryCodes([]);
    setPhase('anonymous');
    setNotice(message ?? null);
  }, []);

  // Si el cliente HTTP no logra recuperar la sesión, se vuelve al login.
  useEffect(() => {
    onSessionExpired(() => reset('Su sesión expiró. Inicie sesión nuevamente.'));
    return () => onSessionExpired(null);
  }, [reset]);

  // Restaurar la sesión al recargar la página (solo si ya tenía el MFA verificado).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokens.refresh) {
        setPhase('anonymous');
        return;
      }
      try {
        if (!(await refreshTokens())) throw new Error('sin sesión');
        const me = await api<{ user: SessionUser; mfaVerified: boolean }>('/auth/me');
        if (!me.mfaVerified) throw new Error('MFA pendiente');
        if (cancelled) return;
        setUser(me.user);
        setPhase('authenticated');
      } catch {
        if (cancelled) return;
        tokens.clear();
        setPhase('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<
      TokenPair & { user: SessionUser; mfa: { enrolled: boolean; verified: boolean } }
    >('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    tokens.set(res);
    setUser(res.user);
    setNotice(null);
    setPhase(res.mfa.enrolled ? 'mfa_verify' : 'mfa_setup');
  }, []);

  const setupMfa = useCallback(
    () => api<MfaSetupData>('/auth/mfa/setup', { method: 'POST' }),
    [],
  );

  const enableMfa = useCallback(async (code: string) => {
    const res = await api<TokenPair & { recoveryCodes: string[] }>('/auth/mfa/enable', {
      method: 'POST',
      body: { code },
    });
    tokens.set(res);
    setRecoveryCodes(res.recoveryCodes);
    setPhase('recovery_codes');
  }, []);

  const verifyMfa = useCallback(async (input: { code?: string; recoveryCode?: string }) => {
    const res = await api<TokenPair>('/auth/mfa/verify', { method: 'POST', body: input });
    tokens.set(res);
    setPhase('authenticated');
  }, []);

  const acknowledgeRecovery = useCallback(() => {
    setRecoveryCodes([]);
    setPhase('authenticated');
  }, []);

  const logout = useCallback(
    async (message?: string) => {
      try {
        if (tokens.access) await api('/auth/logout', { method: 'POST' });
      } catch {
        /* la sesión local se cierra igual */
      }
      reset(message);
    },
    [reset],
  );

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  }, []);

  const keepAlive = useCallback(async () => {
    try {
      await api('/auth/me');
    } catch {
      /* si la sesión murió, el cliente HTTP ya redirige al login */
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      phase,
      user,
      recoveryCodes,
      notice,
      login,
      setupMfa,
      enableMfa,
      verifyMfa,
      acknowledgeRecovery,
      logout,
      changePassword,
      keepAlive,
    }),
    [
      phase,
      user,
      recoveryCodes,
      notice,
      login,
      setupMfa,
      enableMfa,
      verifyMfa,
      acknowledgeRecovery,
      logout,
      changePassword,
      keepAlive,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
