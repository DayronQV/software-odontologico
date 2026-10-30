import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { ContactChannel, NotificationStatus, Role } from '@prisma/client';
import type { Queue } from 'bullmq';
import { jobIdFor } from '../src/notifications/outbox/notification-outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { NOTIFICATIONS_QUEUE } from '../src/queue/queue.module';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';
import {
  createChairs,
  createPatient,
  createProcedure,
  createProfessional,
  postAppointment,
  slot,
  waitFor,
} from './fixtures';

const HOUR = 3_600_000;

describe('Notificaciones y recordatorios (RF-11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queue: Queue;
  let reception: TestSession;
  let admin: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
    reception = await createSession(app, Role.RECEPCIONISTA);
    admin = await createSession(app, Role.ADMIN_TI);
  });
  afterAll(() => app.close());

  async function book(patientOverrides: Record<string, unknown> = {}, day = 5, hour = 10) {
    const { chairs } = await createChairs(app, 1);
    const professional = await createProfessional(app);
    const procedure = await createProcedure(app);
    const patient = await createPatient(app, reception.accessToken, patientOverrides);
    const res = await postAppointment(app, reception.accessToken, {
      patientId: patient.id,
      professionalId: professional.professionalId,
      chairId: chairs[0].id,
      procedureIds: [procedure.id],
      ...slot(day, hour),
    }).expect(201);
    return { appointmentId: res.body.id as string, startAt: new Date(res.body.startAt), patient };
  }

  const logsOf = (appointmentId: string) =>
    prisma.db.notificationLog.findMany({ where: { appointmentId }, orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }] });

  describe('al agendar', () => {
    it('envía la confirmación de inmediato por el canal preferido del paciente (WhatsApp simulado)', async () => {
      const { appointmentId } = await book({ preferredChannel: ContactChannel.WHATSAPP });
      const confirmation = await waitFor(async () =>
        (await logsOf(appointmentId)).find((l) => l.kind === 'CONFIRMATION' && l.status === NotificationStatus.SENT),
      );
      expect(confirmation).toMatchObject({ channel: 'WHATSAPP', attempts: 1 });
      expect(confirmation.providerMessageId).toMatch(/^sim-whatsapp-/);
      expect(confirmation.body).toContain('quedó agendada');
      expect(confirmation.body).toContain('Responda SÍ');
    });

    it('programa los recordatorios a 48 h y 24 h antes de la cita', async () => {
      const { appointmentId, startAt } = await book();
      const reminders = (await logsOf(appointmentId)).filter((l) => l.kind === 'REMINDER');

      expect(reminders.map((r) => r.leadHours)).toEqual([48, 24]);
      expect(reminders.map((r) => r.scheduledFor.getTime())).toEqual([
        startAt.getTime() - 48 * HOUR,
        startAt.getTime() - 24 * HOUR,
      ]);
      expect(reminders.every((r) => r.status === NotificationStatus.PENDING)).toBe(true);

      // están realmente en la cola de BullMQ, con espera hasta su hora
      for (const reminder of reminders) {
        const job = await queue.getJob(jobIdFor(reminder.id));
        expect(job).toBeTruthy();
        expect(job!.opts.delay).toBeGreaterThan(24 * HOUR);
        expect(job!.opts.attempts).toBe(5);
        expect(job!.opts.backoff).toMatchObject({ type: 'exponential' });
      }
    });

    it('respeta las horas de recordatorio configuradas por el administrador', async () => {
      const before = (await http(app).get('/api/catalog/settings').set(bearer(admin.accessToken))).body;
      await http(app).patch('/api/catalog/settings').set(bearer(admin.accessToken)).send({ reminderHours: [72] }).expect(200);
      try {
        const { appointmentId } = await book({}, 6);
        const reminders = (await logsOf(appointmentId)).filter((l) => l.kind === 'REMINDER');
        expect(reminders.map((r) => r.leadHours)).toEqual([72]);
      } finally {
        await http(app).patch('/api/catalog/settings').set(bearer(admin.accessToken)).send({ reminderHours: before.reminderHours }).expect(200);
      }
    });

    it('envía el correo de confirmación de verdad a Mailpit cuando el canal es EMAIL', async () => {
      const email = `confirmacion-${Date.now()}@correo.test`;
      const { appointmentId } = await book({ preferredChannel: ContactChannel.EMAIL, email });

      const message = await waitFor(async () => {
        const res = await fetch('http://localhost:8025/api/v1/messages?limit=50');
        const data = (await res.json()) as { messages: { To: { Address: string }[]; Subject: string; ID: string }[] };
        return data.messages.find((m) => m.To.some((t) => t.Address === email));
      });
      expect(message.Subject).toContain('Cita agendada');
      const log = await waitFor(async () => (await logsOf(appointmentId)).find((l) => l.status === 'SENT' && l.channel === 'EMAIL'));
      expect(log.recipient).toBe(email);
    });
  });

  describe('contacto del paciente', () => {
    it('no envía nada si el paciente no autorizó el contacto', async () => {
      const { appointmentId } = await book({ contactConsent: false });
      const skipped = await waitFor(async () => (await logsOf(appointmentId)).find((l) => l.kind === 'CONFIRMATION' && l.status === 'SKIPPED'));
      expect(skipped.error).toContain('no autorizó');
    });

    it('omite el envío si falta el teléfono o el correo del canal elegido', async () => {
      const { appointmentId } = await book({ preferredChannel: ContactChannel.EMAIL, email: undefined });
      const skipped = await waitFor(async () => (await logsOf(appointmentId)).find((l) => l.kind === 'CONFIRMATION' && l.status === 'SKIPPED'));
      expect(skipped.error).toContain('correo');
    });
  });

  describe('cuando la cita cambia', () => {
    it('reprogramar cancela los recordatorios viejos, programa los nuevos y avisa al paciente', async () => {
      const { appointmentId, startAt } = await book({}, 5, 10);
      const oldReminders = (await logsOf(appointmentId)).filter((l) => l.kind === 'REMINDER');
      await waitFor(async () => (await logsOf(appointmentId)).some((l) => l.kind === 'CONFIRMATION' && l.status === 'SENT'));

      const newStart = slot(7, 15).startAt;
      await http(app).patch(`/api/agenda/appointments/${appointmentId}/reschedule`).set(bearer(reception.accessToken)).send({ startAt: newStart }).expect(200);

      const logs = await logsOf(appointmentId);
      const canceled = logs.filter((l) => l.status === 'CANCELED');
      expect(canceled.map((l) => l.id).sort()).toEqual(oldReminders.map((l) => l.id).sort());
      for (const old of oldReminders) expect(await queue.getJob(jobIdFor(old.id))).toBeFalsy();

      const fresh = logs.filter((l) => l.kind === 'REMINDER' && l.status === 'PENDING');
      expect(fresh.map((r) => r.scheduledFor.getTime())).toEqual([
        new Date(newStart).getTime() - 48 * HOUR,
        new Date(newStart).getTime() - 24 * HOUR,
      ]);
      expect(new Date(newStart).getTime()).not.toBe(startAt.getTime());
      const rescheduled = await waitFor(async () => (await logsOf(appointmentId)).find((l) => l.kind === 'RESCHEDULED' && l.status === 'SENT'));
      expect(rescheduled.body).toContain('reprogramada');
    });

    it('cancelar la cita retira los recordatorios pendientes', async () => {
      const { appointmentId } = await book();
      const pending = (await logsOf(appointmentId)).filter((l) => l.kind === 'REMINDER');
      expect(pending).toHaveLength(2);

      await http(app).post(`/api/agenda/appointments/${appointmentId}/status`).set(bearer(reception.accessToken)).send({ to: 'CANCELED', reason: 'No podrá asistir' }).expect(200);

      const after = (await logsOf(appointmentId)).filter((l) => l.kind === 'REMINDER');
      expect(after.every((l) => l.status === NotificationStatus.CANCELED)).toBe(true);
      for (const reminder of pending) expect(await queue.getJob(jobIdFor(reminder.id))).toBeFalsy();
    });

    it('marcar "No asistió" también cancela lo pendiente', async () => {
      const { appointmentId } = await book();
      await http(app).post(`/api/agenda/appointments/${appointmentId}/status`).set(bearer(reception.accessToken)).send({ to: 'NO_SHOW' }).expect(200);
      const reminders = (await logsOf(appointmentId)).filter((l) => l.kind === 'REMINDER');
      expect(reminders.every((l) => l.status === NotificationStatus.CANCELED)).toBe(true);
    });
  });

  describe('historial de notificaciones por cita', () => {
    it('lista confirmación y recordatorios con contacto enmascarado', async () => {
      const { appointmentId } = await book({ phone: '+593 99 123 4567' });
      await waitFor(async () => (await logsOf(appointmentId)).some((l) => l.status === 'SENT'));

      const res = await http(app).get(`/api/notifications/appointments/${appointmentId}`).set(bearer(reception.accessToken)).expect(200);
      expect(res.body.map((n: { kind: string; leadHours: number | null }) => [n.kind, n.leadHours])).toEqual([
        ['CONFIRMATION', null],
        ['REMINDER', 48],
        ['REMINDER', 24],
      ]);
      const sent = res.body.find((n: { status: string }) => n.status === 'SENT');
      expect(sent.recipient).toBe('***4567');
      expect(sent.body).toContain('Hola Paciente');
    });

    it('404 si la cita no existe; solo personal con acceso a pacientes; la lectura se audita', async () => {
      await http(app).get('/api/notifications/appointments/00000000-0000-4000-8000-000000000000').set(bearer(reception.accessToken)).expect(404);
      const { appointmentId } = await book();
      await http(app).get(`/api/notifications/appointments/${appointmentId}`).set(bearer(admin.accessToken)).expect(403);
      await http(app).get(`/api/notifications/appointments/${appointmentId}`).expect(401);

      await http(app).get(`/api/notifications/appointments/${appointmentId}`).set(bearer(reception.accessToken)).expect(200);
      const audited = await prisma.db.auditLog.findFirst({ where: { entity: 'NotificationLog', userId: reception.user.id } });
      expect(audited).not.toBeNull();
    });
  });
});
