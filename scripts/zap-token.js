/** Imprime un token de acceso de odontólogo (con MFA activado ahora) para el escaneo autenticado de ZAP. */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const OTPAuth = require(path.join(__dirname, '..', 'backend', 'node_modules', 'otpauth'));

const BASE = process.env.BASE_URL ?? 'https://localhost';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sigo-Dev-2026!';

async function call(method, url, token, body) {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`);
  return data;
}

(async () => {
  const login = await call('POST', '/auth/login', null, { email: 'odontologo@sigo.test', password: PASSWORD });
  const setup = await call('POST', '/auth/mfa/setup', login.accessToken);
  const totp = new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(setup.secret) });
  const enabled = await call('POST', '/auth/mfa/enable', login.accessToken, { code: totp.generate() });
  process.stdout.write(enabled.accessToken);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
