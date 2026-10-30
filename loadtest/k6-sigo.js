/**
 * Prueba de carga de SIGO-Dental con k6 (RNF-03: 150 usuarios concurrentes; RNF-01: expediente + odontograma < 1,5 s).
 * Cada usuario virtual es uno de los 150 usuarios reales (con MFA) y navega según su rol.
 *   k6 run -e BASE_URL=https://localhost loadtest/k6-sigo.js
 * Umbrales (la prueba FALLA si no se cumplen): errores < 1 %, expediente p95 < 1 500 ms, API p95 < 1 500 ms.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'https://localhost';
const DATA = JSON.parse(open('./users.json'));
const STAGES = (__ENV.QUICK ? [
  { duration: '15s', target: 150 },
  { duration: '30s', target: 150 },
  { duration: '10s', target: 0 },
] : [
  { duration: '1m', target: 150 }, // subida gradual hasta 150 usuarios
  { duration: '4m', target: 150 }, // meseta: 150 usuarios concurrentes
  { duration: '30s', target: 0 },
]);

export const options = {
  insecureSkipTLSVerify: true,
  stages: STAGES,
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
    expediente_duration: ['p(95)<1500'],
    checks: ['rate>0.99'],
  },
};

const expedienteDuration = new Trend('expediente_duration', true);
const errors = new Rate('errores_funcionales');

const headers = (user) => ({ Authorization: `Bearer ${user.accessToken}`, 'Content-Type': 'application/json' });
const get = (user, path, tag) => http.get(`${BASE}/api${path}`, { headers: headers(user), tags: { name: tag || path.replace(/[0-9a-f-]{36}/g, ':id').split('?')[0] } });
const ok = (res, name) => {
  const passed = check(res, { [`${name} 200`]: (r) => r.status === 200 });
  errors.add(!passed);
  return passed;
};

/** Expediente completo (RNF-01): ficha + alertas críticas + odontograma, medidos en conjunto. */
function expediente(user, patientId) {
  const started = Date.now();
  const responses = http.batch([
    ['GET', `${BASE}/api/patients/${patientId}`, null, { headers: headers(user), tags: { name: '/patients/:id' } }],
    ['GET', `${BASE}/api/patients/${patientId}/odontogram`, null, { headers: headers(user), tags: { name: '/patients/:id/odontogram' } }],
    ['GET', `${BASE}/api/patients/${patientId}/medical-history`, null, { headers: headers(user), tags: { name: '/patients/:id/medical-history' } }],
  ]);
  expedienteDuration.add(Date.now() - started);
  responses.forEach((r, i) => ok(r, ['ficha', 'odontograma', 'anamnesis'][i]));
}

const FLOWS = {
  RECEPCIONISTA(user, d) {
    ok(get(user, '/patients?pageSize=20'), 'lista de pacientes');
    ok(get(user, `/patients?q=Mendoza`, '/patients?q'), 'búsqueda');
    const today = new Date();
    const from = new Date(today.getTime() - 86_400_000).toISOString();
    const to = new Date(today.getTime() + 7 * 86_400_000).toISOString();
    ok(get(user, `/agenda/appointments?from=${from}&to=${to}`, '/agenda/appointments'), 'agenda');
    ok(get(user, '/agenda/appointments/waiting-room'), 'sala de espera');
    ok(get(user, `/patients/${d.patientId}`), 'ficha');
  },
  ODONTOLOGO(user, d) {
    group('expediente', () => expediente(user, d.patientId));
    ok(get(user, `/patients/${d.patientId}/notes`), 'notas SOEP');
    ok(get(user, `/patients/${d.patientId}/timeline`), 'línea de tiempo');
    ok(get(user, `/patients/${d.patientId}/treatment-plans`), 'planes');
  },
  ASISTENTE(user, d) {
    group('expediente', () => expediente(user, d.patientId));
    ok(get(user, `/patients/${d.patientId}/vital-signs`), 'signos vitales');
    ok(get(user, '/inventory/stock'), 'existencias');
  },
  AUDITOR(user) {
    ok(get(user, '/reports/dashboard'), 'panel de indicadores');
    ok(get(user, '/reports/revenue'), 'reporte de ingresos');
    ok(get(user, '/inventory/alerts'), 'alertas de inventario');
  },
  ADMIN_TI(user) {
    ok(get(user, '/system/status'), 'telemetría');
    ok(get(user, '/audit?pageSize=20'), 'auditoría');
    ok(get(user, '/users'), 'usuarios');
  },
};

export default function () {
  const user = DATA.users[(__VU - 1) % DATA.users.length];
  FLOWS[user.role](user, DATA);
  sleep(1 + Math.random() * 2); // tiempo de lectura de una persona
}
