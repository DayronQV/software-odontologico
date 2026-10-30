/**
 * Prepara las cuentas de prueba de la matriz de navegadores: por cada proyecto de Playwright y rol crea un
 * usuario con MFA activo y guarda sus códigos de recuperación en e2e/sessions.json (no se versiona).
 * Cada prueba inicia sesión por la API con contraseña + un código de recuperación (de un solo uso), de modo
 * que no depende del reloj ni choca con la protección anti-repetición del TOTP.
 * Requiere un sistema recién levantado con datos semilla (administrador aún sin MFA).
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OTPAuth = require(path.join(__dirname, '..', 'backend', 'node_modules', 'otpauth'));

const BASE = process.env.BASE_URL ?? 'https://localhost';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sigo-Dev-2026!';
const PROJECTS = ['chromium-1920', 'firefox-1920', 'webkit-1920', 'chromium-1366', 'firefox-1366', 'webkit-1366', 'tablet-ipad-webkit', 'tablet-ipad-vertical-webkit', 'tablet-android-chromium'];
const ROLES = ['RECEPCIONISTA', 'ODONTOLOGO', 'AUDITOR', 'ADMIN_TI'];

async function call(method, url, token, body) {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function enroll(email) {
  const login = await call('POST', '/auth/login', null, { email, password: PASSWORD });
  const setup = await call('POST', '/auth/mfa/setup', login.accessToken);
  const totp = new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(setup.secret) });
  const enabled = await call('POST', '/auth/mfa/enable', login.accessToken, { code: totp.generate() });
  return { accessToken: enabled.accessToken, recoveryCodes: enabled.recoveryCodes };
}

(async () => {
  const admin = await enroll('admin@sigo.test');
  const accounts = {};
  for (const project of PROJECTS) {
    for (const role of ROLES) {
      const email = `pw-${project}-${role.toLowerCase()}@sigo.test`;
      await call('POST', '/users', admin.accessToken, { email, fullName: `Prueba ${project} ${role}`, role, password: PASSWORD });
      const { recoveryCodes } = await enroll(email);
      accounts[`${project}:${role}`] = { email, recoveryCodes };
    }
  }
  const reception = accounts[`${PROJECTS[0]}:RECEPCIONISTA`];
  const login = await call('POST', '/auth/login', null, { email: reception.email, password: PASSWORD });
  const verified = await call('POST', '/auth/mfa/verify', login.accessToken, { recoveryCode: reception.recoveryCodes.shift() });
  const patients = await call('GET', '/patients?q=Mendoza', verified.accessToken);
  fs.writeFileSync(path.join(__dirname, 'sessions.json'), JSON.stringify({ password: PASSWORD, patientId: patients.items[0].id, accounts }, null, 2));
  console.log(`Cuentas listas: ${Object.keys(accounts).length} (e2e/sessions.json)`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
