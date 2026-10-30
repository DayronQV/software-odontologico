import { INestApplication } from '@nestjs/common';
import { AppointmentStatus, Role } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import { isExclusionViolation } from '../src/common/prisma-errors';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createSession, createTestApp, enrollSession, http, TestSession } from './helpers';
import {
  createChairs,
  createPatient,
  createProcedure,
  createProfessional,
  emptyHistory,
  postAppointment,
  slot,
} from './fixtures';

describe('Agenda de citas (RF-09, RF-10, RN-03)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reception: TestSession;
  let assistant: TestSession;
  let admin: TestSession;
  let auditor: TestSession;
  let wsUrl: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();
    wsUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    prisma = app.get(PrismaService);
    reception = await createSession(app, Role.RECEPCIONISTA);
    assistant = await createSession(app, Role.ASISTENTE);
    admin = await createSession(app, Role.ADMIN_TI);
    auditor = await createSession(app, Role.AUDITOR);
  });
  afterAll(() => app.close());

  /** Un escenario completo con recursos propios: paciente, profesional, sillones y procedimiento. */
  async function scenario(options: { history?: boolean } = { history: true }) {
    const { chairs, officeId } = await createChairs(app, 2);
    const professional = await createProfessional(app);
    const dentist = await enrollSession(app, professional.user);
    const procedure = await createProcedure(app, { durationMinutes: 45 });
    const patient = await createPatient(app, reception.accessToken, options.history ? { medicalHistory: emptyHistory } : {});
    const book = (overrides: Record<string, unknown> = {}, day = 5, hour = 10) =>
      postAppointment(app, reception.accessToken, {
        patientId: patient.id,
        professionalId: professional.professionalId,
        chairId: chairs[0].id,
        procedureIds: [procedure.id],
        ...slot(day, hour),
        ...overrides,
      } as never);
    return { chairs, officeId, professional, dentist, procedure, patient, book };
  }

  const changeStatus = (id: string, token: string, to: AppointmentStatus, reason?: string) =>
    http(app).post(`/api/agenda/appointments/${id}/status`).set(bearer(token)).send({ to, reason });

  describe('creación de citas', () => {
    it('agenda con paciente, profesional, sillón y procedimientos; calcula el fin con la duración', async () => {
      const s = await scenario();
      const { startAt } = slot(5, 10);
      const res = await s.book({ endAt: undefined }).expect(201);
      expect(res.body).toMatchObject({
        status: 'SCHEDULED',
        patient: { id: s.patient.id, hasMedicalHistory: true },
        chair: { id: s.chairs[0].id, officeId: s.officeId },
        procedures: [{ id: s.procedure.id, durationMinutes: 45 }],
      });
      expect(new Date(res.body.endAt).getTime() - new Date(startAt).getTime()).toBe(45 * 60_000);
      expect(res.body.allowedTransitions).toEqual(['CONFIRMED', 'WAITING_ROOM', 'CANCELED', 'NO_SHOW']);

      const history = await http(app).get(`/api/agenda/appointments/${res.body.id}/history`).set(bearer(reception.accessToken)).expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0]).toMatchObject({ toStatus: 'SCHEDULED', user: { role: 'RECEPCIONISTA' } });
    });

    it('valida el cuerpo y los recursos', async () => {
      const s = await scenario();
      await s.book({ procedureIds: [] }).expect(400);
      await s.book({ procedureIds: ['no-uuid'] }).expect(400);
      await s.book({ startAt: 'mañana' }).expect(400);
      await s.book({ procedureIds: ['00000000-0000-4000-8000-000000000000'] }).expect(400);
      await s.book({ patientId: '00000000-0000-4000-8000-000000000000' }).expect(400);
      await s.book({ chairId: '00000000-0000-4000-8000-000000000000' }).expect(400);
      await s.book({ extra: 'campo' }).expect(400);
    });

    it('rechaza horarios inválidos: pasado, fin anterior al inicio, fuera de la clínica, duración absurda', async () => {
      const s = await scenario();
      await s.book({ ...slot(-1, 10) }).expect(400); // pasado
      const { startAt } = slot(5, 10);
      await s.book({ startAt, endAt: startAt }).expect(400);
      await s.book({ startAt: slot(5, 10).startAt, endAt: slot(5, 9).endAt }).expect(400);
      const outside = await s.book({ ...slot(5, 6) }).expect(400);
      expect(outside.body.message).toContain('horario de la clínica');
      await s.book({ ...slot(5, 22) }).expect(400);
      await s.book({ startAt, endAt: new Date(new Date(startAt).getTime() + 9 * 3600_000).toISOString() }).expect(400);
    });

    it('rechaza fuera del horario laboral del profesional', async () => {
      const s = await scenario();
      await prisma.db.professionalSchedule.deleteMany({ where: { professionalId: s.professional.professionalId } });
      await prisma.db.professionalSchedule.create({
        data: { professionalId: s.professional.professionalId, weekday: new Date(slot(5, 10).startAt).getUTCDay(), startMinute: 600, endMinute: 720 },
      });
      await s.book({ ...slot(5, 10) }).expect(201); // 10:00 dentro de 10:00–12:00
      const out = await s.book({ ...slot(5, 14) }).expect(400);
      expect(out.body.message).toContain('profesional');
    });

    it('no agenda con recursos desactivados', async () => {
      const s = await scenario();
      await prisma.db.chair.update({ where: { id: s.chairs[0].id }, data: { active: false } });
      await s.book().expect(400);
      await prisma.db.professional.update({ where: { id: s.professional.professionalId }, data: { active: false } });
      await s.book({ chairId: s.chairs[1].id }).expect(400);
    });
  });

  describe('RN-03: sin solapamiento de sillón', () => {
    it('el MISMO sillón no admite dos citas a la vez aunque cambien odontólogo y paciente', async () => {
      const a = await scenario();
      await a.book().expect(201);

      const otherDentist = await createProfessional(app);
      const otherPatient = await createPatient(app, reception.accessToken);
      const conflict = await postAppointment(app, reception.accessToken, {
        patientId: otherPatient.id,
        professionalId: otherDentist.professionalId, // odontólogo distinto
        chairId: a.chairs[0].id, // mismo sillón
        procedureIds: [a.procedure.id],
        ...slot(5, 10),
      }).expect(409);
      expect(conflict.body.message).toContain('Sillón 1');
      expect(conflict.body.message).toMatch(/ya tiene una cita de \d{2}:\d{2} a \d{2}:\d{2}/);
    });

    it('rechaza solapamientos parciales, pero permite citas contiguas y otros sillones', async () => {
      const a = await scenario();
      const otherDentist = await createProfessional(app);
      const book = (patientId: string, startAt: string, chairId = a.chairs[0].id) =>
        postAppointment(app, reception.accessToken, {
          patientId,
          professionalId: otherDentist.professionalId,
          chairId,
          procedureIds: [a.procedure.id],
          startAt,
          endAt: new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString(),
        });
      await a.book({ ...slot(6, 10, 0, 30) }).expect(201); // 10:00–10:30

      const p1 = await createPatient(app, reception.accessToken);
      await book(p1.id, slot(6, 10, 15).startAt).expect(409); // 10:15–10:45 se cruza
      await book(p1.id, slot(6, 9, 45).startAt).expect(409); // 09:45–10:15 se cruza
      await book(p1.id, slot(6, 10, 30).startAt).expect(201); // 10:30–11:00 contigua
      const p2 = await createPatient(app, reception.accessToken);
      await book(p2.id, slot(6, 10, 0).startAt, a.chairs[1].id).expect(201); // otro sillón, misma hora
    });

    it('el profesional y el paciente tampoco pueden estar en dos citas a la vez', async () => {
      const a = await scenario();
      await a.book().expect(201);
      const sameDentist = await a.book({ chairId: a.chairs[1].id, patientId: (await createPatient(app, reception.accessToken)).id }).expect(409);
      expect(sameDentist.body.message).toContain('profesional');

      const samePatient = await a.book({ chairId: a.chairs[1].id, professionalId: (await createProfessional(app)).professionalId }).expect(409);
      expect(samePatient.body.message).toContain('paciente');
    });

    it('una cita cancelada o con inasistencia libera el horario', async () => {
      const a = await scenario();
      const first = await a.book().expect(201);
      await changeStatus(first.body.id, reception.accessToken, 'CANCELED', 'El paciente avisó').expect(200);

      const other = await createPatient(app, reception.accessToken);
      const dentist2 = await createProfessional(app);
      await postAppointment(app, reception.accessToken, {
        patientId: other.id,
        professionalId: dentist2.professionalId,
        chairId: a.chairs[0].id,
        procedureIds: [a.procedure.id],
        ...slot(5, 10),
      }).expect(201);
    });

    it('con dos peticiones SIMULTÁNEAS para el mismo sillón, solo una se agenda', async () => {
      const a = await scenario();
      const dentist2 = await createProfessional(app);
      const patient2 = await createPatient(app, reception.accessToken);
      const results = await Promise.all([
        a.book({ ...slot(7, 11) }),
        postAppointment(app, reception.accessToken, {
          patientId: patient2.id,
          professionalId: dentist2.professionalId,
          chairId: a.chairs[0].id,
          procedureIds: [a.procedure.id],
          ...slot(7, 11),
        }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const count = await prisma.db.appointment.count({ where: { chairId: a.chairs[0].id } });
      expect(count).toBe(1);
    });

    it('la base de datos misma impide el solapamiento (restricción de exclusión)', async () => {
      const a = await scenario();
      const dentist2 = await createProfessional(app);
      const patient2 = await createPatient(app, reception.accessToken);
      const { startAt, endAt } = slot(8, 15);
      const base = { startAt: new Date(startAt), endAt: new Date(endAt), createdById: reception.user.id };
      await prisma.db.appointment.create({ data: { ...base, patientId: a.patient.id, professionalId: a.professional.professionalId, chairId: a.chairs[0].id } });

      const error = await prisma.db.appointment
        .create({ data: { ...base, patientId: patient2.id, professionalId: dentist2.professionalId, chairId: a.chairs[0].id } })
        .catch((e) => e);
      expect(isExclusionViolation(error)).toBe(true);
    });
  });

  describe('consulta de la agenda (RF-09)', () => {
    it('filtra por rango, sillón, consultorio y profesional', async () => {
      const a = await scenario();
      const b = await scenario();
      const first = await a.book({ ...slot(9, 9) }).expect(201);
      await b.book({ ...slot(9, 9) }).expect(201);

      const list = (query: object) => http(app).get('/api/agenda/appointments').query(query).set(bearer(reception.accessToken)).expect(200);
      const day = { from: slot(9, 0).startAt, to: slot(10, 0).startAt };

      expect((await list({ ...day, chairId: a.chairs[0].id })).body.map((x: { id: string }) => x.id)).toEqual([first.body.id]);
      expect((await list({ ...day, officeId: a.officeId })).body).toHaveLength(1);
      expect((await list({ ...day, professionalId: a.professional.professionalId })).body).toHaveLength(1);
      expect((await list({ ...day, patientId: b.patient.id })).body[0].patient.id).toBe(b.patient.id);
      expect((await list({ ...day, chairId: a.chairs[1].id })).body).toEqual([]);
      expect((await list({ from: slot(30, 0).startAt, to: slot(31, 0).startAt, chairId: a.chairs[0].id })).body).toEqual([]);
    });

    it('valida el rango de fechas', async () => {
      const get = (query: object) => http(app).get('/api/agenda/appointments').query(query).set(bearer(reception.accessToken));
      await get({ from: slot(5, 0).startAt, to: slot(4, 0).startAt }).expect(400);
      await get({ from: slot(1, 0).startAt, to: slot(80, 0).startAt }).expect(400);
      await get({ from: 'hoy' }).expect(400);
      await get({}).expect(200); // por defecto: la semana que empieza hoy
    });

    it('el odontólogo solo ve su propia agenda, aunque pida otra', async () => {
      const a = await scenario();
      const b = await scenario();
      const mine = await a.book({ ...slot(9, 9) }).expect(201);
      const theirs = await b.book({ ...slot(9, 9) }).expect(201);

      const range = { from: slot(9, 0).startAt, to: slot(10, 0).startAt };
      const seen = await http(app).get('/api/agenda/appointments').query({ ...range, professionalId: b.professional.professionalId }).set(bearer(a.dentist.accessToken)).expect(200);
      expect(seen.body.map((x: { id: string }) => x.id)).toEqual([mine.body.id]);
      await http(app).get(`/api/agenda/appointments/${mine.body.id}`).set(bearer(a.dentist.accessToken)).expect(200);
      await http(app).get(`/api/agenda/appointments/${theirs.body.id}`).set(bearer(a.dentist.accessToken)).expect(403);
    });

    it('el asistente ve la agenda completa', async () => {
      const a = await scenario();
      const created = await a.book({ ...slot(9, 12) }).expect(201);
      const res = await http(app).get(`/api/agenda/appointments/${created.body.id}`).set(bearer(assistant.accessToken)).expect(200);
      expect(res.body.id).toBe(created.body.id);
    });
  });

  describe('estados de la cita (RF-10)', () => {
    it('recorre el flujo completo con la bitácora de quién y cuándo', async () => {
      const s = await scenario();
      const created = await s.book().expect(201);
      const id = created.body.id as string;

      await changeStatus(id, reception.accessToken, 'CONFIRMED').expect(200);
      await changeStatus(id, reception.accessToken, 'WAITING_ROOM').expect(200);
      const attention = await changeStatus(id, s.dentist.accessToken, 'IN_ATTENTION').expect(200);
      expect(attention.body.allowedTransitions).toEqual(['ATTENDED']);
      const done = await changeStatus(id, s.dentist.accessToken, 'ATTENDED').expect(200);
      expect(done.body.status).toBe('ATTENDED');
      expect(done.body.allowedTransitions).toEqual([]);

      const history = await http(app).get(`/api/agenda/appointments/${id}/history`).set(bearer(reception.accessToken)).expect(200);
      expect(history.body.map((h: { toStatus: string }) => h.toStatus)).toEqual(['SCHEDULED', 'CONFIRMED', 'WAITING_ROOM', 'IN_ATTENTION', 'ATTENDED']);
      expect(history.body[3].user.role).toBe('ODONTOLOGO');
    });

    it('rechaza transiciones inválidas', async () => {
      const s = await scenario();
      const id = (await s.book().expect(201)).body.id as string;
      await changeStatus(id, s.dentist.accessToken, 'ATTENDED').expect(409); // no estuvo en atención
      await changeStatus(id, reception.accessToken, 'SCHEDULED').expect(409);
      await changeStatus(id, reception.accessToken, 'CANCELED', 'Motivo').expect(200);
      await changeStatus(id, reception.accessToken, 'CONFIRMED').expect(409); // ya cancelada
    });

    it('respeta quién puede hacer cada cambio', async () => {
      const s = await scenario();
      const id = (await s.book().expect(201)).body.id as string;
      await changeStatus(id, reception.accessToken, 'WAITING_ROOM').expect(200);

      await changeStatus(id, reception.accessToken, 'IN_ATTENTION').expect(403); // recepción no atiende
      await changeStatus(id, s.dentist.accessToken, 'CANCELED', 'x').expect(403); // el dentista no cancela
      await changeStatus(id, admin.accessToken, 'CONFIRMED').expect(403);
      await changeStatus(id, auditor.accessToken, 'CONFIRMED').expect(403);

      const stranger = await enrollSession(app, (await createProfessional(app)).user);
      await changeStatus(id, stranger.accessToken, 'IN_ATTENTION').expect(403); // no es su cita
      await changeStatus(id, assistant.accessToken, 'IN_ATTENTION').expect(200); // el asistente sí
    });

    it('cancelar exige motivo y lo guarda', async () => {
      const s = await scenario();
      const id = (await s.book().expect(201)).body.id as string;
      await changeStatus(id, reception.accessToken, 'CANCELED').expect(400);
      await changeStatus(id, reception.accessToken, 'CANCELED', '   ').expect(400);
      const res = await changeStatus(id, reception.accessToken, 'CANCELED', 'Viaje imprevisto').expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELED', cancelReason: 'Viaje imprevisto' });
    });

    it('no se puede iniciar la atención sin anamnesis (RF-02)', async () => {
      const s = await scenario({ history: false });
      const id = (await s.book().expect(201)).body.id as string;
      await changeStatus(id, reception.accessToken, 'WAITING_ROOM').expect(200);
      const blocked = await changeStatus(id, s.dentist.accessToken, 'IN_ATTENTION').expect(409);
      expect(blocked.body.message).toContain('anamnesis');

      await http(app).put(`/api/patients/${s.patient.id}/medical-history`).set(bearer(reception.accessToken)).send(emptyHistory).expect(200);
      await changeStatus(id, s.dentist.accessToken, 'IN_ATTENTION').expect(200);
    });

    it('la respuesta del paciente (simulada) confirma la cita', async () => {
      const s = await scenario();
      const id = (await s.book().expect(201)).body.id as string;
      const res = await http(app).post(`/api/agenda/appointments/${id}/patient-confirmation`).set(bearer(reception.accessToken)).expect(200);
      expect(res.body.status).toBe('CONFIRMED');
      const history = await http(app).get(`/api/agenda/appointments/${id}/history`).set(bearer(reception.accessToken)).expect(200);
      expect(history.body.at(-1).note).toContain('paciente');
      await http(app).post(`/api/agenda/appointments/${id}/patient-confirmation`).set(bearer(reception.accessToken)).expect(409); // ya confirmada
    });
  });

  describe('reprogramación', () => {
    it('cambia hora y sillón conservando la duración; la propia cita no cuenta como conflicto', async () => {
      const s = await scenario();
      const created = await s.book({ ...slot(5, 10, 0, 45) }).expect(201);
      const id = created.body.id as string;

      // Mover 15 min: se solapa con su propio horario anterior y debe permitirse
      const moved = await http(app).patch(`/api/agenda/appointments/${id}/reschedule`).set(bearer(reception.accessToken)).send({ startAt: slot(5, 10, 15).startAt }).expect(200);
      expect(new Date(moved.body.endAt).getTime() - new Date(moved.body.startAt).getTime()).toBe(45 * 60_000);

      const otherChair = await http(app).patch(`/api/agenda/appointments/${id}/reschedule`).set(bearer(reception.accessToken)).send({ startAt: slot(5, 10, 15).startAt, chairId: s.chairs[1].id }).expect(200);
      expect(otherChair.body.chair.id).toBe(s.chairs[1].id);
    });

    it('respeta los conflictos y el horario', async () => {
      const a = await scenario();
      const first = await a.book({ ...slot(5, 10) }).expect(201);
      const dentist2 = await createProfessional(app);
      const patient2 = await createPatient(app, reception.accessToken);
      const second = await postAppointment(app, reception.accessToken, {
        patientId: patient2.id, professionalId: dentist2.professionalId, chairId: a.chairs[0].id, procedureIds: [a.procedure.id], ...slot(5, 11),
      }).expect(201);

      await http(app).patch(`/api/agenda/appointments/${second.body.id}/reschedule`).set(bearer(reception.accessToken)).send({ startAt: slot(5, 10).startAt }).expect(409);
      await http(app).patch(`/api/agenda/appointments/${first.body.id}/reschedule`).set(bearer(reception.accessToken)).send({ startAt: slot(5, 4).startAt }).expect(400);
    });

    it('solo citas programadas o confirmadas; solo recepción', async () => {
      const s = await scenario();
      const id = (await s.book().expect(201)).body.id as string;
      await http(app).patch(`/api/agenda/appointments/${id}/reschedule`).set(bearer(s.dentist.accessToken)).send({ startAt: slot(6, 10).startAt }).expect(403);
      await changeStatus(id, reception.accessToken, 'WAITING_ROOM').expect(200);
      await http(app).patch(`/api/agenda/appointments/${id}/reschedule`).set(bearer(reception.accessToken)).send({ startAt: slot(6, 10).startAt }).expect(409);
      await http(app).patch('/api/agenda/appointments/00000000-0000-4000-8000-000000000000/reschedule').set(bearer(reception.accessToken)).send({ startAt: slot(6, 10).startAt }).expect(404);
    });
  });

  describe('sala de espera en tiempo real', () => {
    it('lista a quienes esperan hoy por orden de llegada; el dentista solo a los suyos', async () => {
      const a = await scenario();
      const b = await scenario();
      const now = Date.now();
      const make = async (s: Awaited<ReturnType<typeof scenario>>, offsetMin: number) => {
        const startAt = new Date(now + offsetMin * 60_000);
        const appointment = await prisma.db.appointment.create({
          data: {
            patientId: s.patient.id, professionalId: s.professional.professionalId, chairId: s.chairs[0].id,
            startAt, endAt: new Date(startAt.getTime() + 30 * 60_000), createdById: reception.user.id, status: 'WAITING_ROOM',
          },
        });
        await prisma.db.appointmentStatusLog.create({ data: { appointmentId: appointment.id, toStatus: 'WAITING_ROOM', userId: reception.user.id } });
        return appointment.id;
      };
      const idA = await make(a, 0);
      const idB = await make(b, 0);

      const all = await http(app).get('/api/agenda/appointments/waiting-room').set(bearer(reception.accessToken)).expect(200);
      const ids = all.body.map((x: { id: string }) => x.id);
      expect(ids).toEqual(expect.arrayContaining([idA, idB]));
      expect(ids.indexOf(idA)).toBeLessThan(ids.indexOf(idB)); // llegó primero

      const mine = await http(app).get('/api/agenda/appointments/waiting-room').set(bearer(a.dentist.accessToken)).expect(200);
      expect(mine.body.map((x: { id: string }) => x.id)).toEqual([idA]);
    });

    it('notifica por WebSocket al crear y al cambiar de estado', async () => {
      const s = await scenario();
      const socket: Socket = io(wsUrl, { path: '/ws', transports: ['websocket'], auth: { token: s.dentist.accessToken }, reconnection: false });
      const events: Array<{ name: string; payload: { id: string; status: string } }> = [];
      for (const name of ['agenda:appointment.created', 'agenda:appointment.status']) {
        socket.on(name, (payload) => events.push({ name, payload }));
      }
      await new Promise<void>((resolve) => socket.once('connect', () => resolve()));

      const id = (await s.book().expect(201)).body.id as string;
      await changeStatus(id, reception.accessToken, 'CONFIRMED').expect(200);
      await new Promise((resolve) => setTimeout(resolve, 600));
      socket.close();

      expect(events.map((e) => [e.name, e.payload.id, e.payload.status])).toEqual([
        ['agenda:appointment.created', id, 'SCHEDULED'],
        ['agenda:appointment.status', id, 'CONFIRMED'],
      ]);
    });
  });

  describe('desactivación con citas pendientes', () => {
    it('no se desactiva un sillón, un profesional ni un paciente con citas por atender', async () => {
      const s = await scenario();
      await s.book().expect(201);
      const adminToken = bearer(admin.accessToken);
      await http(app).patch(`/api/catalog/chairs/${s.chairs[0].id}`).set(adminToken).send({ active: false }).expect(409);
      await http(app).patch(`/api/catalog/offices/${s.officeId}`).set(adminToken).send({ active: false }).expect(409);
      await http(app).patch(`/api/catalog/professionals/${s.professional.professionalId}`).set(adminToken).send({ active: false }).expect(409);
      await http(app).patch(`/api/patients/${s.patient.id}`).set(bearer(reception.accessToken)).send({ active: false }).expect(409);
      await http(app).patch(`/api/catalog/chairs/${s.chairs[1].id}`).set(adminToken).send({ active: false }).expect(200); // el otro sillón está libre
    });
  });

  describe('permisos', () => {
    it('solo recepción agenda; el administrador y el auditor no acceden a la agenda', async () => {
      const s = await scenario();
      const body = { patientId: s.patient.id, professionalId: s.professional.professionalId, chairId: s.chairs[0].id, procedureIds: [s.procedure.id], ...slot(5, 10) };
      for (const outsider of [s.dentist, assistant]) {
        await postAppointment(app, outsider.accessToken, body).expect(403);
      }
      for (const outsider of [admin, auditor]) {
        await http(app).get('/api/agenda/appointments').set(bearer(outsider.accessToken)).expect(403);
        await postAppointment(app, outsider.accessToken, body).expect(403);
      }
      await http(app).get('/api/agenda/appointments').expect(401);
    });

    it('cada lectura y cambio de la agenda queda auditado', async () => {
      const s = await scenario();
      const id = (await s.book().expect(201)).body.id as string;
      await changeStatus(id, reception.accessToken, 'CONFIRMED').expect(200);
      const logs = await prisma.db.auditLog.findMany({ where: { entity: 'Appointment', entityId: id } });
      expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['CREATE', 'STATUS_CHANGED']));
    });
  });
});
