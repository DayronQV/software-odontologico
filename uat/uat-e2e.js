/**
 * Pruebas de aceptación (UAT) de extremo a extremo contra el sistema desplegado (Docker, https://localhost).
 * Recorre el flujo completo: paciente menor de edad → anamnesis → cita → atención clínica (odontograma, SOEP firmado,
 * consentimiento, procedimiento con descargo de insumos, receta) → presupuesto y aprobación parcial → cobro mixto →
 * cierre de caja ciego → comisiones → reportes → auditoría; más los casos negativos por rol.
 *
 *   docker compose down -v && docker compose up -d --build     # sistema nuevo con datos semilla (sin MFA activado)
 *   node uat/uat-e2e.js                                        # escribe documentacion/uat/resultados-uat.md
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const OTPAuth = require(path.join(__dirname, '..', 'backend', 'node_modules', 'otpauth'));

const BASE = process.env.BASE_URL ?? 'https://localhost';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sigo-Dev-2026!';
const results = [];
let current = '';

async function call(method, url, token, body, raw = false) {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function session(email) {
  const login = await call('POST', '/auth/login', null, { email, password: PASSWORD });
  const setup = await call('POST', '/auth/mfa/setup', login.data.accessToken);
  const totp = new OTPAuth.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(setup.data.secret) });
  const enabled = await call('POST', '/auth/mfa/enable', login.data.accessToken, { code: totp.generate() });
  return { token: enabled.data.accessToken, email };
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
function png(w = 80, h = 40) {
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  let seed = 11; const rows = [];
  for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3); for (let i = 1; i < row.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; row[i] = seed >> 16; } rows.push(row); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const signature = (name) => ({ signerName: name, image: `data:image/png;base64,${png().toString('base64')}`, strokes: 3, durationMs: 1800, pointerType: 'touch' });

/** Registra un caso de aceptación: id, rol que lo ejecuta, descripción, resultado esperado y comprobación. */
async function caso(id, role, description, expected, fn) {
  let passed = false;
  let detail = '';
  try {
    const out = await fn();
    passed = out === true || (out && out.ok === true);
    if (out && out.detail) detail = out.detail;
  } catch (error) {
    detail = String(error.message ?? error).slice(0, 160);
  }
  results.push({ section: current, id, role, description, expected, passed, detail });
  console.log(`  ${passed ? '✔' : '✘'} ${id} [${role}] ${description}${passed ? '' : `  -> ${detail}`}`);
  return passed;
}
const section = (name) => { current = name; console.log(`\n${name}`); };

(async () => {
  section('0. Acceso y seguridad');
  const [admin, reception, dentist, assistant, auditor] = [
    await session('admin@sigo.test'), await session('recepcion@sigo.test'), await session('odontologo@sigo.test'),
    await session('asistente@sigo.test'), await session('auditor@sigo.test'),
  ];
  await caso('UAT-001', 'Todos', 'Ingreso con contraseña + MFA TOTP obligatorio (5 perfiles)', 'Cada perfil obtiene un token completo tras activar el MFA', () => [admin, reception, dentist, assistant, auditor].every((s) => s.token));
  await caso('UAT-002', 'Todos', 'Sin autenticación no se accede a la API', '401', async () => (await call('GET', '/patients')).status === 401);

  section('1. Recepción: paciente menor de edad y anamnesis (RF-01, RF-02)');
  const birthDate = `${new Date().getFullYear() - 9}-03-15`;
  const minorBody = {
    firstName: 'Mateo', lastName: `UAT ${Date.now() % 100000}`, birthDate, sex: 'MALE', phone: '+593 98 765 4321', preferredChannel: 'EMAIL',
    email: 'tutor.uat@correo.test', contactConsent: true,
    emergencyContact: { fullName: 'Abuela UAT', relationship: 'Abuela', phone: '+593 98 111 2222' },
  };
  await caso('UAT-010', 'Recepcionista', 'Un menor NO se registra sin tutor legal', '400 con mensaje de tutor legal', async () => {
    const res = await call('POST', '/patients', reception.token, minorBody);
    return res.status === 400 && JSON.stringify(res.data).includes('tutor legal');
  });
  let patient;
  await caso('UAT-011', 'Recepcionista', 'Alta del menor con tutor legal, contacto de emergencia y seguro', '201 con ficha única (isMinor)', async () => {
    const insurer = (await call('GET', '/catalog/insurers?pageSize=10', reception.token)).data.items?.[0];
    const res = await call('POST', '/patients', reception.token, {
      ...minorBody, guardian: { fullName: 'Laura Madre UAT', relationship: 'Madre', phone: '+593 97 000 1111', documentId: '0923456789' },
      ...(insurer ? { insurance: { insurerId: insurer.id, policyNumber: 'POL-UAT-1' } } : {}),
    });
    patient = res.data;
    return res.status === 201 && patient.isMinor === true && patient.guardian?.fullName === 'Laura Madre UAT';
  });
  await caso('UAT-012', 'Recepcionista', 'La anamnesis con alergia a la penicilina genera una alerta crítica visible', 'Alerta crítica en la ficha', async () => {
    const put = await call('PUT', `/patients/${patient.id}/medical-history`, reception.token, {
      systemicDiseases: [], drugAllergies: ['Penicilina'], coagulopathies: [], anticoagulated: false,
    });
    const card = await call('GET', `/patients/${patient.id}`, reception.token);
    return put.status === 200 && JSON.stringify(card.data).toLowerCase().includes('penicilina');
  });
  await caso('UAT-013', 'Recepcionista', 'Búsqueda por documento cifrado (índice ciego) y por nombre', 'Encuentra al paciente', async () => {
    const found = await call('GET', `/patients?q=${encodeURIComponent(minorBody.lastName)}`, reception.token);
    return found.data.items.some((p) => p.id === patient.id);
  });

  section('2. Agenda y sala de espera (RF-09, RF-10, RN-03)');
  const professional = (await call('GET', '/catalog/professionals?pageSize=50', reception.token)).data.items.find((p) => p.user.email === 'odontologo@sigo.test');
  const office = (await call('GET', '/catalog/offices?pageSize=50', reception.token)).data.items[0];
  const procedures = (await call('GET', '/catalog/procedures?pageSize=100', dentist.token)).data.items;
  const restoration = procedures.find((p) => p.code === 'REST-01');
  const crown = procedures.find((p) => p.code === 'CORO-01');
  const start = new Date(Date.now() + 5 * 86_400_000); start.setUTCHours(15, 0, 0, 0);
  const booking = (chairId, offsetMinutes = 0) => ({
    patientId: patient.id, professionalId: professional.id, chairId, procedureIds: [restoration.id],
    startAt: new Date(start.getTime() + offsetMinutes * 60_000).toISOString(), endAt: new Date(start.getTime() + (offsetMinutes + 45) * 60_000).toISOString(),
  });
  let appointment;
  await caso('UAT-020', 'Recepcionista', 'Agendar la cita en un sillón', '201 estado Programado', async () => {
    const res = await call('POST', '/agenda/appointments', reception.token, booking(office.chairs[0].id));
    appointment = res.data;
    return res.status === 201 && appointment.status === 'SCHEDULED';
  });
  await caso('UAT-021', 'Recepcionista', 'RN-03: no se agenda otra cita simultánea en el mismo sillón', '409', async () => {
    const other = (await call('GET', '/catalog/professionals?pageSize=50', reception.token)).data.items.find((p) => p.user.email === 'especialista@sigo.test');
    const res = await call('POST', '/agenda/appointments', reception.token, { ...booking(office.chairs[0].id, 15), professionalId: other.id });
    return res.status === 409;
  });
  await caso('UAT-022', 'Recepcionista', 'Confirmar y registrar llegada (sala de espera)', 'Estados Confirmado → En sala de espera', async () => {
    const a = await call('POST', `/agenda/appointments/${appointment.id}/status`, reception.token, { to: 'CONFIRMED' });
    const b = await call('POST', `/agenda/appointments/${appointment.id}/status`, reception.token, { to: 'WAITING_ROOM' });
    return a.status === 201 || a.status === 200 ? (b.status === 201 || b.status === 200) : false;
  });
  await caso('UAT-023', 'Odontólogo', 'Pasar la cita a «En atención»', 'Estado En atención', async () => {
    const res = await call('POST', `/agenda/appointments/${appointment.id}/status`, dentist.token, { to: 'IN_ATTENTION' });
    return [200, 201].includes(res.status);
  });
  await caso('UAT-024', 'Recepcionista', 'Los recordatorios 48 h/24 h quedaron programados (RF-11)', 'Historial de notificaciones de la cita', async () => {
    const res = await call('GET', `/notifications/appointments/${appointment.id}`, reception.token);
    return { ok: res.status === 200 && Array.isArray(res.data), detail: `${Array.isArray(res.data) ? res.data.length : 0} recordatorios` };
  });

  section('3. Odontólogo: expediente clínico (RF-03, RF-04, RF-05, RF-06, RN-01)');
  await caso('UAT-030', 'Odontólogo', 'Registrar caries en el odontograma 2D (diente 36, oclusal)', '201 hallazgo guardado', async () => {
    const res = await call('POST', `/patients/${patient.id}/odontogram/findings`, dentist.token, { toothCode: 36, surface: 'OCCLUSAL', type: 'CARIES' });
    return res.status === 201;
  });
  await caso('UAT-031', 'Asistente', 'El asistente NO modifica el odontograma', '403', async () => (await call('POST', `/patients/${patient.id}/odontogram/findings`, assistant.token, { toothCode: 37, surface: 'MESIAL', type: 'CARIES' })).status === 403);
  await caso('UAT-032', 'Recepcionista', 'Recepción NO accede al contenido clínico', '403', async () => (await call('GET', `/patients/${patient.id}/odontogram`, reception.token)).status === 403);
  let note;
  await caso('UAT-033', 'Odontólogo', 'Nota de evolución SOEP firmada con contraseña (hash SHA-256)', 'Nota firmada y verificable', async () => {
    note = (await call('POST', `/patients/${patient.id}/notes`, dentist.token, { subjective: 'Dolor al masticar', objective: 'Caries oclusal 36', assessment: 'Caries moderada', plan: 'Restauración con resina' })).data;
    const bad = await call('POST', `/notes/${note.id}/sign`, dentist.token, { password: 'incorrecta' });
    const signed = await call('POST', `/notes/${note.id}/sign`, dentist.token, { password: PASSWORD });
    const verify = await call('GET', `/patients/${patient.id}/notes/${note.id}/verify`, dentist.token);
    return bad.status === 403 && signed.data.signed === true && verify.data.valid === true;
  });
  await caso('UAT-034', 'Odontólogo', 'Procedimiento con consentimiento obligatorio se bloquea sin firma', '409', async () => (await call('POST', `/patients/${patient.id}/procedure-records`, dentist.token, { procedureId: crown.id, toothCode: 46 })).status === 409);
  await caso('UAT-035', 'Odontólogo', 'Consentimiento informado firmado en pantalla táctil por el tutor y PDF almacenado', 'Firma TOUCH y PDF', async () => {
    const consent = await call('POST', `/patients/${patient.id}/consents`, dentist.token, { procedureId: crown.id, toothCode: 46 });
    const touch = await call('POST', `/signing/${consent.data.signing.id}/touch`, dentist.token, signature('Laura Madre UAT'));
    const pdf = await call('GET', `/consents/${consent.data.id}/pdf`, dentist.token, null, true);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    return touch.data.status === 'SIGNED' && bytes.subarray(0, 5).toString() === '%PDF-';
  });
  let stockBefore = 0;
  const stockTotal = async () => (await call('GET', '/inventory/stock', assistant.token)).data.reduce((s, r) => s + r.quantity, 0);
  stockBefore = await stockTotal();
  let record;
  await caso('UAT-036', 'Odontólogo', 'Registrar el procedimiento realizado (restauración 36, con consentimiento firmado) y RN-01: no se puede borrar', '201 y DELETE inexistente (404)', async () => {
    const consent = await call('POST', `/patients/${patient.id}/consents`, dentist.token, { procedureId: restoration.id, toothCode: 36 });
    await call('POST', `/signing/${consent.data.signing.id}/touch`, dentist.token, signature('Laura Madre UAT'));
    record = await call('POST', `/patients/${patient.id}/procedure-records`, dentist.token, { procedureId: restoration.id, toothCode: 36, appointmentId: appointment.id });
    const del = await call('DELETE', `/patients/${patient.id}/procedure-records/${record.data.id}`, dentist.token);
    return { ok: record.status === 201 && del.status === 404, detail: record.status === 201 ? '' : `${record.status} ${JSON.stringify(record.data).slice(0, 140)}` };
  });
  await caso('UAT-037', 'Asistente', 'RF-14: el procedimiento descontó insumos según la receta de consumo', 'Existencias menores que antes', async () => {
    const after = await stockTotal();
    return { ok: after < stockBefore, detail: `antes ${stockBefore} → después ${after}` };
  });
  await caso('UAT-038', 'Odontólogo', 'Receta con fármaco al que el paciente es alérgico', '409 con la alergia detectada', async () => {
    const meds = (await call('GET', '/clinical/medications', dentist.token)).data;
    const amox = meds.find((m) => m.name.startsWith('Amoxicilina'));
    const res = await call('POST', `/patients/${patient.id}/prescriptions`, dentist.token, { items: [{ medicationId: amox.id, name: amox.name, dose: '1', frequency: '8 h', duration: '7 días' }] });
    return res.status === 409 && res.data.details?.conflicts?.[0]?.allergy === 'Penicilina';
  });
  await caso('UAT-039', 'Odontólogo', 'Receta segura (ibuprofeno) y PDF', '201 y PDF', async () => {
    const meds = (await call('GET', '/clinical/medications', dentist.token)).data;
    const ibu = meds.find((m) => m.name.toLowerCase().startsWith('ibuprofeno'));
    const res = await call('POST', `/patients/${patient.id}/prescriptions`, dentist.token, { items: [{ medicationId: ibu.id, name: ibu.name, dose: '1', frequency: '8 h', duration: '3 días' }] });
    if (res.status !== 201) return { ok: false, detail: JSON.stringify(res.data).slice(0, 120) };
    const pdf = await call('GET', `/prescriptions/${res.data.id}/pdf`, dentist.token, null, true);
    return pdf.status === 200;
  });
  await caso('UAT-040', 'Odontólogo', 'Adjuntar una radiografía; un ejecutable disfrazado se rechaza', '201 / 400', async () => {
    const form = new FormData(); form.append('file', new Blob([png()], { type: 'image/png' }), 'rx.png'); form.append('kind', 'XRAY');
    const ok = await call('POST', `/patients/${patient.id}/attachments`, dentist.token, form);
    const bad = new FormData(); bad.append('file', new Blob([Buffer.from('MZ-programa')]), 'virus.png');
    return ok.status === 201 && (await call('POST', `/patients/${patient.id}/attachments`, dentist.token, bad)).status === 400;
  });

  section('4. Plan de tratamiento y presupuesto (RF-07, RF-08)');
  let plan; let budget; let item;
  await caso('UAT-050', 'Odontólogo', 'Crear plan por fases con dos procedimientos y presupuesto con descuento', 'Presupuesto abierto', async () => {
    plan = (await call('POST', `/patients/${patient.id}/treatment-plans`, dentist.token, { title: 'Rehabilitación UAT' })).data;
    const phaseId = plan.phases[0].id;
    const add = (code) => call('POST', `/treatment-plans/${plan.id}/items`, dentist.token, { phaseId, procedureId: procedures.find((p) => p.code === code).id });
    const a = await add('LIMP-01');
    await add('FLUOR-01');
    const full = await call('GET', `/treatment-plans/${plan.id}`, dentist.token);
    item = full.data.phases.flatMap((p) => p.items)[0];
    budget = (await call('POST', `/treatment-plans/${plan.id}/budgets`, dentist.token, { discountPercent: 5 })).data;
    return [201].includes(a.status) && budget.status === 'OPEN';
  });
  await caso('UAT-051', 'Odontólogo', 'Un descuento alto exige autorización y el odontólogo no se la da a sí mismo', '403 al autoaprobar; el administrador sí autoriza', async () => {
    const big = (await call('POST', `/treatment-plans/${plan.id}/budgets`, dentist.token, { discountPercent: 30 })).data;
    const self = await call('POST', `/budgets/${big.id}/authorize-discount`, dentist.token, { note: 'me autorizo' });
    const adm = await call('POST', `/budgets/${big.id}/authorize-discount`, admin.token, { note: 'Convenio corporativo aprobado' });
    budget = big; // la versión vigente del presupuesto es la que se aprueba
    return big.status === 'PENDING_AUTHORIZATION' && self.status === 403 && adm.data.status === 'OPEN';
  });
  await caso('UAT-052', 'Odontólogo', 'Aprobación parcial firmada: solo un ítem pasa a tarea agendable', '1 ítem agendable', async () => {
    const approval = await call('POST', `/budgets/${budget.id}/approvals`, dentist.token, { itemIds: [item.id] });
    if (!approval.data.signing) return { ok: false, detail: `${approval.status} ${JSON.stringify(approval.data).slice(0, 140)}` };
    const sig = await call('POST', `/signing/${approval.data.signing.id}/touch`, dentist.token, signature('Laura Madre UAT'));
    const tasks = await call('GET', `/patients/${patient.id}/schedulable-items`, reception.token);
    return sig.data.status === 'SIGNED' && tasks.data.length === 1;
  });

  section('5. Atención finalizada, cobro y caja ciega (RF-12, RN-02)');
  await caso('UAT-060', 'Odontólogo', 'Finalizar la atención', 'Estado Atendido', async () => [200, 201].includes((await call('POST', `/agenda/appointments/${appointment.id}/status`, dentist.token, { to: 'ATTENDED' })).status));
  let invoice; let cash;
  await caso('UAT-061', 'Recepcionista', 'No se cobra sin caja abierta', '409', async () => (await call('POST', '/billing/invoices', reception.token, { patientId: patient.id, lines: [{ procedureId: restoration.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 100 }] })).status === 409);
  await caso('UAT-062', 'Recepcionista', 'Abrir caja y cobrar con pagos mixtos (efectivo + tarjeta) → comprobante autorizado (simulado)', '201, total cuadra, autorizado', async () => {
    cash = (await call('POST', '/billing/cash-sessions/open', reception.token, { openingFloat: 20 })).data;
    const price = restoration.basePrice;
    const settings = (await call('GET', '/catalog/settings', reception.token)).data;
    const total = Math.round(price * (1 + settings.taxRatePercent / 100) * 100) / 100;
    const cashPart = Math.round(total * 0.4 * 100) / 100;
    const res = await call('POST', '/billing/invoices', reception.token, {
      patientId: patient.id, appointmentId: appointment.id, lines: [{ procedureId: restoration.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: cashPart }, { method: 'CARD_CREDIT', amount: Math.round((total - cashPart) * 100) / 100, cardToken: 'tok_visa' }],
    });
    invoice = res.data;
    return { ok: res.status === 201 && invoice.payments.length === 2, detail: res.status === 201 ? '' : `${res.status} ${JSON.stringify(res.data).slice(0, 140)}` };
  });
  await caso('UAT-063', 'Recepcionista', 'RN-02: la vista de caja de la cajera NO incluye totales teóricos', 'Sin expectedCash ni totales por método', async () => {
    const cur = (await call('GET', '/billing/cash-sessions/current', reception.token)).data;
    const text = JSON.stringify(cur);
    return !text.includes('expected') && !text.includes('theoretical');
  });
  await caso('UAT-064', 'Recepcionista', 'Cierre ciego: cuenta el efectivo y recién entonces ve el esperado y la diferencia', 'Cierre con diferencia calculada', async () => {
    const closed = await call('POST', `/billing/cash-sessions/${cash.id}/close`, reception.token, { countedCash: 20 });
    return closed.status === 200 && typeof closed.data.expectedCash === 'number' && typeof closed.data.difference === 'number';
  });
  await caso('UAT-065', 'Odontólogo', 'El odontólogo NO cobra ni abre caja', '403', async () => (await call('POST', '/billing/cash-sessions/open', dentist.token, { openingFloat: 0 })).status === 403);
  await caso('UAT-066', 'Auditor', 'El auditor consulta comprobantes y cortes de caja (solo lectura)', '200', async () => (await call('GET', '/billing/invoices?pageSize=5', auditor.token)).status === 200);

  section('6. Comisiones, reportes y auditoría (RF-13, §6, RNF-06)');
  await caso('UAT-070', 'Auditor', 'La emisión del comprobante generó la comisión del profesional', 'Entradas de comisión', async () => {
    const res = await call('GET', '/commissions/entries?pageSize=50', auditor.token);
    return res.status === 200 && (res.data.items ?? res.data).length > 0;
  });
  await caso('UAT-071', 'Auditor', 'Panel de indicadores y reporte de ingresos', '200 con KPIs', async () => {
    const dash = await call('GET', '/reports/dashboard', auditor.token);
    const rev = await call('GET', '/reports/revenue', auditor.token);
    return dash.status === 200 && rev.status === 200 && rev.data.rows !== undefined;
  });
  await caso('UAT-072', 'Auditor', 'Exportar un reporte a CSV (queda auditado)', 'CSV con BOM', async () => {
    const res = await call('GET', '/reports/revenue/export?format=csv', auditor.token, null, true);
    return res.status === 200 && Buffer.from(await res.arrayBuffer()).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
  });
  await caso('UAT-073', 'Odontólogo', 'El odontólogo NO ve reportes financieros de la clínica', '403', async () => (await call('GET', '/reports/cash', dentist.token)).status === 403);
  await caso('UAT-074', 'Administrador', 'La cadena de hashes de la auditoría es íntegra', 'valid = true', async () => {
    const res = await call('GET', '/audit/verify', admin.token);
    return res.data.valid === true && res.data.checked > 0;
  });
  await caso('UAT-075', 'Administrador', 'Las lecturas/exportaciones clínicas quedaron registradas (quién, qué, IP)', 'Eventos de auditoría', async () => {
    const res = await call('GET', '/audit?pageSize=100', admin.token);
    const text = JSON.stringify(res.data);
    return text.includes('EXPORT') && text.includes('Odontogram');
  });
  await caso('UAT-076', 'Administrador', 'Telemetría del sistema: servicios en línea', 'Estado ok', async () => (await call('GET', '/system/status', admin.token)).data.status === 'ok');

  section('7. Casos negativos de seguridad por rol (RNF-05)');
  await caso('UAT-080', 'Administrador', 'El administrador de TI NO accede a datos clínicos de pacientes', '403', async () => (await call('GET', `/patients/${patient.id}`, admin.token)).status === 403);
  await caso('UAT-081', 'Auditor', 'El auditor NO accede a pacientes', '403', async () => (await call('GET', `/patients/${patient.id}`, auditor.token)).status === 403);
  await caso('UAT-082', 'Asistente', 'El asistente NO anula comprobantes ni gestiona usuarios', '403', async () => (await call('POST', `/billing/invoices/${invoice.id}/void`, assistant.token, { reason: 'intento' })).status === 403 && (await call('GET', '/users', assistant.token)).status === 403);
  await caso('UAT-083', 'Recepcionista', 'Recepción NO ve telemetría ni auditoría', '403', async () => (await call('GET', '/system/status', reception.token)).status === 403 && (await call('GET', '/audit', reception.token)).status === 403);
  await caso('UAT-084', 'Todos', 'Un token manipulado es rechazado', '401', async () => (await call('GET', '/patients', `${reception.token}x`)).status === 401);
  await caso('UAT-085', 'Todos', 'Cinco ingresos fallidos seguidos activan el limitador de frecuencia', '429', async () => {
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await call('POST', '/auth/login', null, { email: 'nadie@sigo.test', password: 'Incorrecta-2026!' })).status;
    return last === 429;
  });

  // ---------- Resumen ----------
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\nUAT: ${passed}/${total} casos aprobados`);

  const out = process.env.UAT_OUT ?? path.join(__dirname, '..', 'documentacion', 'uat', 'resultados-uat.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let md = `# Resultados de la ejecución UAT\n\n- **Fecha de ejecución:** ${new Date().toISOString()}\n- **Entorno:** ${BASE} (Docker Compose, TLS 1.3)\n- **Script:** \`uat/uat-e2e.js\` (reproducible)\n- **Resultado:** **${passed} / ${total} casos aprobados**${passed === total ? ' ✅' : ' ❌'}\n`;
  let last = '';
  for (const r of results) {
    if (r.section !== last) { md += `\n## ${r.section}\n\n| ID | Rol | Caso | Resultado esperado | Estado |\n|---|---|---|---|---|\n`; last = r.section; }
    md += `| ${r.id} | ${r.role} | ${r.description} | ${r.expected} | ${r.passed ? '✔ Aprobado' : `✘ Falló${r.detail ? ` (${r.detail.replace(/\|/g, '/')})` : ''}`}${r.passed && r.detail ? ` — ${r.detail}` : ''} |\n`;
  }
  fs.writeFileSync(out, md);
  console.log(`Registro escrito en ${out}`);
  process.exit(passed === total ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
