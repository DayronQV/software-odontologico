/**
 * Prepara la prueba de carga: crea usuarios (mezcla de roles), les activa el MFA y guarda sus tokens.
 * Requiere un sistema RECIÉN levantado con datos semilla (el administrador aún sin MFA) y, para que
 * el limitador no frene a un único generador de carga, THROTTLE_AUTH_LIMIT y THROTTLE_LIMIT altos:
 *
 *   THROTTLE_AUTH_LIMIT=1000 THROTTLE_LIMIT=100000 docker compose up -d --build backend
 *   node loadtest/prepare-users.js            # crea 150 usuarios -> loadtest/users.json (no se versiona)
 *   k6 run loadtest/k6-sigo.js                # o: docker run --rm -i --network host grafana/k6 run - < loadtest/k6-sigo.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OTPAuth = require(path.join(__dirname, '..', 'backend', 'node_modules', 'otpauth'));

const BASE = process.env.BASE_URL ?? 'https://localhost';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sigo-Dev-2026!';
const TOTAL = Number(process.env.USERS ?? 150);
const MIX = [
  ['RECEPCIONISTA', 0.4],
  ['ODONTOLOGO', 0.33],
  ['ASISTENTE', 0.17],
  ['AUDITOR', 0.06],
  ['ADMIN_TI', 0.04],
];

async function call(method, url, token, body) {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${text.slice(0, 200)}`);
  return data;
}

async function enroll(email, password) {
  const login = await call('POST', '/auth/login', null, { email, password });
  const setup = await call('POST', '/auth/mfa/setup', login.accessToken);
  const totp = new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(setup.secret) });
  const enabled = await call('POST', '/auth/mfa/enable', login.accessToken, { code: totp.generate() });
  return { accessToken: enabled.accessToken, refreshToken: enabled.refreshToken, secret: setup.secret };
}

(async () => {
  const admin = await enroll('admin@sigo.test', PASSWORD);
  const users = [];
  let index = 0;
  for (const [role, share] of MIX) {
    const count = Math.max(1, Math.round(TOTAL * share));
    for (let i = 0; i < count; i++) {
      index += 1;
      const email = `carga-${index}@sigo.test`;
      await call('POST', '/users', admin.accessToken, { email, fullName: `Usuario de carga ${index}`, role, password: PASSWORD });
      const session = await enroll(email, PASSWORD);
      users.push({ email, role, ...session });
    }
  }
  const reception = users.find((u) => u.role === 'RECEPCIONISTA');
  const patients = await call('GET', '/patients?pageSize=50', reception.accessToken);
  const demo = patients.items.find((p) => p.lastName === 'Mendoza') ?? patients.items[0];
  fs.writeFileSync(
    path.join(__dirname, 'users.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), patientId: demo.id, patientIds: patients.items.map((p) => p.id), admin, users }, null, 2),
  );
  console.log(`Listo: ${users.length} usuarios con MFA, paciente de referencia ${demo.id}`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
