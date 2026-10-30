import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { AuthContext, type AuthContextValue } from '../lib/auth';

export function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    phase: 'anonymous',
    user: null,
    recoveryCodes: [],
    notice: null,
    login: async () => undefined,
    setupMfa: async () => ({ secret: 'ABC', otpauthUrl: 'otpauth://x', qrDataUrl: 'data:image/png;base64,AA' }),
    enableMfa: async () => undefined,
    verifyMfa: async () => undefined,
    acknowledgeRecovery: () => undefined,
    logout: async () => undefined,
    changePassword: async () => undefined,
    keepAlive: async () => undefined,
    ...overrides,
  };
}

export function renderWithProviders(
  ui: ReactElement,
  { auth = fakeAuth(), route = '/' }: { auth?: AuthContextValue; route?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
