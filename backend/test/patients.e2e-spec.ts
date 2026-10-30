import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';
import { createPatient, emptyHistory, patientBody } from './fixtures';

describe('Pacientes y anamnesis (RF-01, RF-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reception: TestSession;
  let dentist: TestSession;
  let assistant: TestSession;
  let admin: TestSession;
  let auditor: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    reception = await createSession(app, Role.RECEPCIONISTA);
    dentist = await createSession(app, Role.ODONTOLOGO);
    assistant = await createSession(app, Role.ASISTENTE);
    admin = await createSession(app, Role.ADMIN_TI);
    auditor = await createSession(app, Role.AUDITOR);
  });
  afterAll(() => app.close());

  const asReception = () => bearer(reception.accessToken);
  const post = (body: object) => http(app).post('/api/patients').set(asReception()).send(body);

  describe('alta de la ficha única (RF-01)', () => {
    it('registra un adulto con contacto de emergencia y calcula la edad', async () => {
      const body = patientBody({ birthDate: '1990-05-20' });
      const res = await post(body).expect(201);
      expect(res.body).toMatchObject({
        firstName: 'Paciente',
        isMinor: false,
        active: true,
        hasMedicalHistory: false,
        alerts: [],
        guardian: null,
        insurance: null,
        emergencyContact: { fullName: 'Contacto Prueba', relationship: 'Hermano' },
      });
      expect(res.body.age).toBeGreaterThanOrEqual(36);
      expect(res.body.documentId).toBe(body.documentId);
      expect(res.body.fullName).toBe(`${body.firstName} ${body.lastName}`);
    });

    it('el menor de edad SOLO se registra con tutor legal', async () => {
      const birthDate = `${new Date().getUTCFullYear() - 10}-03-10`;
      const rejected = await post(patientBody({ birthDate })).expect(400);
      expect(rejected.body.message).toContain('tutor legal');

      const guardian = { fullName: 'Laura Madre', relationship: 'Madre', phone: '+593 97 000 1111', documentId: '0923456789' };
      const ok = await post(patientBody({ birthDate, documentId: undefined, guardian })).expect(201);
      expect(ok.body).toMatchObject({ isMinor: true, age: 10, guardian: { fullName: 'Laura Madre', documentId: '0923456789' } });
    });

    it('un paciente que cumple 18 años deja de requerir tutor', async () => {
      const eighteen = new Date();
      const birthDate = `${eighteen.getUTCFullYear() - 18}-01-01`;
      const res = await post(patientBody({ birthDate })).expect(201);
      expect(res.body.isMinor).toBe(false);
    });

    it('exige contacto de emergencia y valida teléfono, correo y fechas', async () => {
      await post(patientBody({ emergencyContact: undefined })).expect(400);
      await post(patientBody({ phone: 'abc' })).expect(400);
      await post(patientBody({ email: 'no-es-correo' })).expect(400);
      await post(patientBody({ birthDate: '2999-01-01' })).expect(400);
      await post(patientBody({ birthDate: '1800-01-01' })).expect(400);
      await post(patientBody({ birthDate: 'ayer' })).expect(400);
      await post(patientBody({ sex: 'X' })).expect(400);
      await post(patientBody({ firstName: '' })).expect(400);
      await post(patientBody({ esAdmin: true })).expect(400);
    });

    it('registra el seguro dental/convenio y valida la aseguradora y la vigencia', async () => {
      const insurer = await prisma.db.insurer.create({ data: { name: `Seguro ${Date.now()}` } });
      const insurance = { insurerId: insurer.id, policyNumber: 'POL-77', validFrom: '2026-01-01', validUntil: '2026-12-31', coveragePercent: 80 };
      const res = await post(patientBody({ insurance })).expect(201);
      expect(res.body.insurance).toMatchObject({ insurerName: insurer.name, policyNumber: 'POL-77', validUntil: '2026-12-31', coveragePercent: 80 });

      await post(patientBody({ insurance: { ...insurance, insurerId: '00000000-0000-4000-8000-000000000000' } })).expect(400);
      await post(patientBody({ insurance: { ...insurance, validFrom: '2026-12-31', validUntil: '2026-01-01' } })).expect(400);
      await post(patientBody({ insurance: { ...insurance, coveragePercent: 150 } })).expect(400);
      await prisma.db.insurer.update({ where: { id: insurer.id }, data: { active: false } });
      await post(patientBody({ insurance })).expect(400); // aseguradora desactivada
    });

    it('no permite dos pacientes con el mismo documento', async () => {
      const documentId = `DUP-${Date.now()}`;
      await post(patientBody({ documentId })).expect(201);
      const dup = await post(patientBody({ documentId: ` ${documentId} ` })).expect(409);
      expect(dup.body.message).toContain('documento');
    });

    it('guarda el documento CIFRADO y solo deja una huella para buscarlo', async () => {
      const documentId = `SECRETO-${Date.now()}`;
      const patient = await createPatient(app, reception.accessToken, { documentId });
      const raw = await prisma.db.$queryRaw<{ documentId: string; documentHash: string }[]>`
        SELECT "documentId", "documentHash" FROM "Patient" WHERE "id" = ${patient.id}`;
      expect(raw[0].documentId.startsWith('enc:v1:')).toBe(true);
      expect(raw[0].documentId).not.toContain('SECRETO');
      expect(raw[0].documentHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('permite dar de alta con la anamnesis incluida', async () => {
      const res = await post(patientBody({ medicalHistory: { ...emptyHistory, drugAllergies: ['Penicilina'] } })).expect(201);
      expect(res.body.hasMedicalHistory).toBe(true);
      expect(res.body.alerts.map((a: { label: string }) => a.label)).toEqual(['Alergia a penicilina']);
    });
  });

  describe('anamnesis y alertas médicas críticas (RF-02)', () => {
    it('un paciente sin anamnesis aparece sin alertas y marcado como pendiente', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const history = await http(app).get(`/api/patients/${patient.id}/medical-history`).set(asReception()).expect(200);
      expect(history.body).toEqual({ history: null, alerts: [] });
    });

    it('alergia a penicilina → alerta crítica en la ficha y en el listado', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const saved = await http(app)
        .put(`/api/patients/${patient.id}/medical-history`)
        .set(asReception())
        .send({ ...emptyHistory, drugAllergies: ['Alergia a la PENICILINA'], systemicDiseases: ['Diabetes tipo 2'] })
        .expect(200);
      expect(saved.body.alerts).toEqual([
        expect.objectContaining({ label: 'Alergia a penicilina', severity: 'CRITICAL', detail: 'Alergia a la PENICILINA' }),
        expect.objectContaining({ label: 'Diabetes', severity: 'WARNING' }),
      ]);

      const detail = await http(app).get(`/api/patients/${patient.id}`).set(bearer(dentist.accessToken)).expect(200);
      expect(detail.body.hasMedicalHistory).toBe(true);
      expect(detail.body.alerts[0]).toMatchObject({ label: 'Alergia a penicilina', severity: 'CRITICAL' });

      const list = await http(app).get('/api/patients').query({ q: patient.firstName + ' ' + (patient as unknown as { lastName: string }).lastName }).set(asReception()).expect(200);
      expect(list.body.items[0].criticalAlerts.map((a: { label: string }) => a.label)).toEqual(['Alergia a penicilina']);
    });

    it('anticoagulados y coagulopatías generan alerta crítica', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const saved = await http(app)
        .put(`/api/patients/${patient.id}/medical-history`)
        .set(asReception())
        .send({ ...emptyHistory, anticoagulated: true, coagulopathies: ['Hemofilia A'] })
        .expect(200);
      expect(saved.body.alerts.map((a: { label: string }) => a.label).sort()).toEqual(['Coagulopatía', 'Paciente anticoagulado']);
    });

    it('guarda la anamnesis CIFRADA en la base de datos', async () => {
      const patient = await createPatient(app, reception.accessToken);
      await http(app)
        .put(`/api/patients/${patient.id}/medical-history`)
        .set(asReception())
        .send({ ...emptyHistory, drugAllergies: ['Penicilina', 'Látex'], surgicalHistory: 'Apendicectomía 2015', currentMedication: 'Warfarina' })
        .expect(200);
      const raw = await prisma.db.$queryRaw<{ drugAllergies: string[]; surgicalHistory: string }[]>`
        SELECT "drugAllergies", "surgicalHistory" FROM "MedicalHistory" WHERE "patientId" = ${patient.id}`;
      expect(raw[0].drugAllergies.every((a) => a.startsWith('enc:v1:'))).toBe(true);
      expect(JSON.stringify(raw[0])).not.toMatch(/Penicilina|Látex|Apendicectomía/);

      const read = await http(app).get(`/api/patients/${patient.id}/medical-history`).set(asReception()).expect(200);
      expect(read.body.history.drugAllergies).toEqual(['Penicilina', 'Látex']);
      expect(read.body.history.surgicalHistory).toBe('Apendicectomía 2015');
    });

    it('limpia espacios y repetidos, y reemplaza lo anterior', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const put = (body: object) => http(app).put(`/api/patients/${patient.id}/medical-history`).set(asReception()).send(body);
      const first = await put({ ...emptyHistory, drugAllergies: ['  Penicilina ', 'penicilina', '', 'Ibuprofeno'] }).expect(200);
      expect(first.body.history.drugAllergies).toEqual(['Penicilina', 'Ibuprofeno']);

      const second = await put({ ...emptyHistory, drugAllergies: [] }).expect(200);
      expect(second.body.alerts).toEqual([]);
      expect(second.body.history.drugAllergies).toEqual([]);
    });

    it('valida la anamnesis y el paciente', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const put = (body: object) => http(app).put(`/api/patients/${patient.id}/medical-history`).set(asReception()).send(body);
      await put({ drugAllergies: ['x'] }).expect(400); // faltan listas
      await put({ ...emptyHistory, drugAllergies: 'penicilina' }).expect(400);
      await put({ ...emptyHistory, surgicalHistory: 'x'.repeat(1001) }).expect(400);
      await http(app).put('/api/patients/00000000-0000-4000-8000-000000000000/medical-history').set(asReception()).send(emptyHistory).expect(404);
    });

    it('el odontólogo y el asistente también pueden registrar la anamnesis', async () => {
      const patient = await createPatient(app, reception.accessToken);
      for (const staff of [dentist, assistant]) {
        await http(app).put(`/api/patients/${patient.id}/medical-history`).set(bearer(staff.accessToken)).send(emptyHistory).expect(200);
      }
    });
  });

  describe('consulta, búsqueda y modificación', () => {
    it('busca por nombre, apellido, nombre completo y documento exacto', async () => {
      const token = `Zuluaga${Date.now()}`;
      const documentId = `BUSCA-${Date.now()}`;
      const patient = await createPatient(app, reception.accessToken, { firstName: 'Mariana', lastName: token, documentId });
      const ids = async (q: string) =>
        (await http(app).get('/api/patients').query({ q }).set(asReception()).expect(200)).body.items.map((p: { id: string }) => p.id);

      expect(await ids(token)).toEqual([patient.id]);
      expect(await ids(token.toLowerCase().slice(0, 9))).toEqual([patient.id]);
      expect(await ids(`mariana ${token}`)).toEqual([patient.id]);
      expect(await ids(documentId)).toEqual([patient.id]);
      expect(await ids(documentId.slice(0, -2))).toEqual([]); // el documento solo coincide exacto
      expect(await ids('NoExisteNadie')).toEqual([]);
    });

    it('el listado oculta el documento, pagina y filtra por estado', async () => {
      const lastName = `Listado${Date.now()}`;
      for (let i = 0; i < 3; i++) await createPatient(app, reception.accessToken, { lastName });
      const page = await http(app).get('/api/patients').query({ q: lastName, pageSize: 2 }).set(asReception()).expect(200);
      expect(page.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(page.body.items).toHaveLength(2);
      expect(page.body.items[0].documentMasked).toMatch(/^\*+[A-Z0-9]{3}$/);
      expect(JSON.stringify(page.body)).not.toContain('"documentId"');

      const inactive = await http(app).get('/api/patients').query({ q: lastName, active: 'false' }).set(asReception()).expect(200);
      expect(inactive.body.total).toBe(0);
    });

    it('modifica los datos, el contacto de emergencia y el seguro', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const res = await http(app)
        .patch(`/api/patients/${patient.id}`)
        .set(asReception())
        .send({ phone: '+593 91 555 0000', occupation: 'Ingeniera', emergencyContact: { fullName: 'Nuevo Contacto', relationship: 'Madre', phone: '+593 91 000 9999' } })
        .expect(200);
      expect(res.body).toMatchObject({ phone: '+593 91 555 0000', occupation: 'Ingeniera', emergencyContact: { fullName: 'Nuevo Contacto' } });
    });

    it('no permite volver menor de edad a un paciente sin tutor, ni repetir un documento', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const other = await createPatient(app, reception.accessToken);
      const minorDate = `${new Date().getUTCFullYear() - 5}-01-01`;
      await http(app).patch(`/api/patients/${patient.id}`).set(asReception()).send({ birthDate: minorDate }).expect(400);
      await http(app).patch(`/api/patients/${patient.id}`).set(asReception()).send({ documentId: other.documentId }).expect(409);

      const ok = await http(app)
        .patch(`/api/patients/${patient.id}`)
        .set(asReception())
        .send({ birthDate: minorDate, guardian: { fullName: 'Tutor Nuevo', relationship: 'Padre', phone: '+593 90 111 2222' } })
        .expect(200);
      expect(ok.body.isMinor).toBe(true);
    });

    it('se desactiva en lugar de borrarse y deja de aparecer en la búsqueda activa', async () => {
      const patient = await createPatient(app, reception.accessToken);
      const res = await http(app).patch(`/api/patients/${patient.id}`).set(asReception()).send({ active: false }).expect(200);
      expect(res.body.active).toBe(false);
      await http(app).delete(`/api/patients/${patient.id}`).set(asReception()).expect(404); // no existe DELETE

      const active = await http(app).get('/api/patients').query({ q: patient.documentId, active: 'true' }).set(asReception()).expect(200);
      expect(active.body.total).toBe(0);
      await http(app).get(`/api/patients/${patient.id}`).set(asReception()).expect(200); // la historia se conserva
    });

    it('responde 404 y 400 ante identificadores inexistentes o inválidos', async () => {
      await http(app).get('/api/patients/00000000-0000-4000-8000-000000000000').set(asReception()).expect(404);
      await http(app).get('/api/patients/no-es-uuid').set(asReception()).expect(400);
      await http(app).patch('/api/patients/00000000-0000-4000-8000-000000000000').set(asReception()).send({ phone: '+593 91 555 0000' }).expect(404);
    });
  });

  describe('permisos (menor privilegio)', () => {
    it('recepción escribe; odontólogo y asistente solo leen', async () => {
      const patient = await createPatient(app, reception.accessToken);
      for (const staff of [dentist, assistant]) {
        await http(app).get(`/api/patients/${patient.id}`).set(bearer(staff.accessToken)).expect(200);
        await http(app).get('/api/patients').set(bearer(staff.accessToken)).expect(200);
        await http(app).post('/api/patients').set(bearer(staff.accessToken)).send(patientBody()).expect(403);
        await http(app).patch(`/api/patients/${patient.id}`).set(bearer(staff.accessToken)).send({ phone: '+593 91 555 0000' }).expect(403);
      }
    });

    it('el administrador de TI y el auditor NO acceden a datos de pacientes', async () => {
      const patient = await createPatient(app, reception.accessToken);
      for (const outsider of [admin, auditor]) {
        await http(app).get('/api/patients').set(bearer(outsider.accessToken)).expect(403);
        await http(app).get(`/api/patients/${patient.id}`).set(bearer(outsider.accessToken)).expect(403);
        await http(app).get(`/api/patients/${patient.id}/medical-history`).set(bearer(outsider.accessToken)).expect(403);
      }
      await http(app).get('/api/patients').expect(401);
    });
  });

  describe('auditoría (RNF-06)', () => {
    it('registra lecturas y escrituras de la ficha sin copiar datos personales', async () => {
      const patient = await createPatient(app, reception.accessToken);
      await http(app).get(`/api/patients/${patient.id}`).set(bearer(dentist.accessToken)).expect(200);
      await http(app).put(`/api/patients/${patient.id}/medical-history`).set(asReception()).send({ ...emptyHistory, drugAllergies: ['Penicilina'] }).expect(200);
      await http(app).get('/api/patients').query({ q: patient.documentId }).set(asReception()).expect(200);

      const logs = await prisma.db.auditLog.findMany({ where: { entityId: patient.id } });
      const summary = logs.map((l) => `${l.entity}:${l.action}`);
      expect(summary).toEqual(expect.arrayContaining(['Patient:CREATE', 'Patient:READ', 'MedicalHistory:UPDATE']));
      const read = logs.find((l) => l.entity === 'Patient' && l.action === 'READ');
      expect(read?.userId).toBe(dentist.user.id);
      expect(read?.ip).toBeTruthy();

      const rows = await prisma.db.auditLog.findMany({
        where: { OR: [{ entityId: patient.id }, { entity: 'Patient', action: 'READ', entityId: null }] },
      });
      const everything = JSON.stringify(rows, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
      expect(everything).not.toContain(patient.documentId);
      expect(everything).not.toContain('Penicilina');
      expect(everything).not.toContain(patient.firstName + ' ');
    });
  });
});
