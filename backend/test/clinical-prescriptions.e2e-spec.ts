import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicalSetup, ClinicalContext } from './clinical-fixtures';
import { createPatient } from './fixtures';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';

describe('Recetas odontológicas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ClinicalContext;
  let otherDentist: TestSession;
  let amoxicillinId: string;
  let ibuprofenId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await clinicalSetup(app); // el paciente es alérgico a la penicilina
    otherDentist = await createSession(app, Role.ODONTOLOGO);
    const catalog = await http(app).get('/api/clinical/medications').set(bearer(ctx.dentist.accessToken)).expect(200);
    amoxicillinId = catalog.body.find((m: { name: string }) => m.name.startsWith('Amoxicilina 500')).id;
    ibuprofenId = catalog.body.find((m: { name: string }) => m.name.startsWith('Ibuprofeno')).id;
  });
  afterAll(() => app.close());

  const url = (patientId = ctx.patient.id) => `/api/patients/${patientId}/prescriptions`;
  const dentist = () => bearer(ctx.dentist.accessToken);
  const item = (medicationId: string | undefined, name: string) => ({
    medicationId,
    name,
    dose: '1 tableta',
    frequency: 'Cada 8 horas',
    duration: '5 días',
    instructions: 'Con alimentos',
  });

  describe('catálogo de medicamentos', () => {
    it('el personal clínico lo consulta; solo el administrador lo mantiene', async () => {
      const body = {
        name: `Medicamento de prueba ${Date.now()}`,
        activeIngredient: 'Principio',
        presentation: 'Tabletas',
        allergyGroups: ['Familia X', 'familia x'],
      };
      await http(app).post('/api/clinical/medications').set(dentist()).send(body).expect(403);
      const created = await http(app).post('/api/clinical/medications').set(bearer(ctx.admin.accessToken)).send(body).expect(201);
      expect(created.body.allergyGroups).toEqual(['familia x']);
      const updated = await http(app)
        .put(`/api/clinical/medications/${created.body.id}`)
        .set(bearer(ctx.admin.accessToken))
        .send({ ...body, presentation: 'Cápsulas' })
        .expect(200);
      expect(updated.body.presentation).toBe('Cápsulas');
      await http(app).get('/api/clinical/medications').set(bearer(ctx.assistant.accessToken)).expect(200);
      await http(app).get('/api/clinical/medications').set(bearer(ctx.reception.accessToken)).expect(403);
    });
  });

  describe('alerta de alergias', () => {
    it('avisa en vivo cuando el fármaco coincide con una alergia de la anamnesis', async () => {
      const check = await http(app)
        .post(`${url()}/check`)
        .set(dentist())
        .send({ items: [item(amoxicillinId, 'Amoxicilina 500 mg cápsulas'), item(ibuprofenId, 'Ibuprofeno 400 mg')] })
        .expect(200);
      expect(check.body.conflicts).toEqual([
        { drug: 'Amoxicilina 500 mg cápsulas', allergy: 'Penicilina', matchedTerm: 'penicilina' },
      ]);
      expect(await prisma.db.prescription.count({ where: { patientId: ctx.patient.id } })).toBe(0); // no guarda nada
    });

    it('también detecta fármacos escritos a mano', async () => {
      const check = await http(app)
        .post(`${url()}/check`)
        .set(dentist())
        .send({ items: [item(undefined, 'Penicilina G benzatínica')] })
        .expect(200);
      expect(check.body.conflicts).toHaveLength(1);
    });

    it('emitir una receta con un fármaco alérgeno se rechaza con el detalle de la alerta', async () => {
      const res = await http(app)
        .post(url())
        .set(dentist())
        .send({ items: [item(amoxicillinId, 'Amoxicilina 500 mg cápsulas')] })
        .expect(409);
      expect(res.body.message).toMatch(/alérgico/);
      expect(res.body.details.conflicts[0]).toMatchObject({ allergy: 'Penicilina' });
      expect(await prisma.db.prescription.count({ where: { patientId: ctx.patient.id } })).toBe(0);
    });

    it('con una justificación del profesional sí se emite y queda constancia', async () => {
      await http(app)
        .post(url())
        .set(dentist())
        .send({ items: [item(amoxicillinId, 'Amoxicilina')], allergyOverrideReason: 'corta' })
        .expect(400);
      const res = await http(app)
        .post(url())
        .set(dentist())
        .send({
          items: [item(amoxicillinId, 'Amoxicilina 500 mg cápsulas')],
          allergyOverrideReason: 'Reacción previa leve; se coordina con alergología',
        })
        .expect(201);
      expect(res.body.allergyOverrideReason).toBe('Reacción previa leve; se coordina con alergología');
    });
  });

  describe('emisión, historial e inmutabilidad', () => {
    let prescriptionId: string;

    it('emite una receta sin conflicto, con número correlativo, y la lista en el historial', async () => {
      const res = await http(app)
        .post(url())
        .set(dentist())
        .send({
          diagnosis: 'Pulpitis',
          notes: 'Control en 7 días',
          items: [item(ibuprofenId, 'Ibuprofeno 400 mg'), item(undefined, 'Paracetamol 500 mg')],
        })
        .expect(201);
      prescriptionId = res.body.id;
      expect(res.body).toMatchObject({ status: 'ISSUED', diagnosis: 'Pulpitis', allergyOverrideReason: null });
      expect(res.body.displayNumber).toMatch(/^RX-\d{6}$/);
      expect(res.body.items).toHaveLength(2);

      const list = await http(app).get(url()).set(dentist()).expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(2);
      const numbers = list.body.map((p: { number: number }) => p.number);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('exige anamnesis registrada antes de recetar', async () => {
      const noHistory = await createPatient(app, ctx.reception.accessToken);
      await http(app)
        .post(url(noHistory.id))
        .set(dentist())
        .send({ items: [item(ibuprofenId, 'Ibuprofeno 400 mg')] })
        .expect(409);
    });

    it('valida los datos de la receta', async () => {
      const post = (body: Record<string, unknown>) => http(app).post(url()).set(dentist()).send(body);
      await post({ items: [] }).expect(400);
      await post({ items: [{ name: 'Algo' }] }).expect(400);
      await post({ items: [item('no-es-uuid', 'X')] }).expect(400);
      await post({ items: [item('11111111-1111-4111-8111-111111111111', 'Fantasma')] }).expect(400);
    });

    it('una receta emitida no se modifica ni se borra (API y SQL); solo se anula', async () => {
      await http(app).put(`/api/prescriptions/${prescriptionId}`).set(dentist()).send({ notes: 'x' }).expect(404);
      await http(app).delete(`/api/prescriptions/${prescriptionId}`).set(dentist()).expect(404);
      await expect(
        prisma.db.$executeRaw`UPDATE "Prescription" SET "diagnosis" = 'cambiado' WHERE "id" = ${prescriptionId}`,
      ).rejects.toThrow(/solo puede anularse/);
      await expect(
        prisma.db.$executeRaw`UPDATE "PrescriptionItem" SET "dose" = '100 tabletas' WHERE "prescriptionId" = ${prescriptionId}`,
      ).rejects.toThrow(/no se pueden modificar/);
      await expect(
        prisma.db.$executeRaw`DELETE FROM "Prescription" WHERE "id" = ${prescriptionId}`,
      ).rejects.toThrow(/no se pueden eliminar/);
    });

    it('solo quien la emitió la anula, con motivo, y queda registrada como anulada', async () => {
      const post = (token: string, reason = 'Error en la dosis indicada') =>
        http(app).post(`/api/prescriptions/${prescriptionId}/void`).set(bearer(token)).send({ reason });
      await post(otherDentist.accessToken).expect(403);
      await post(ctx.dentist.accessToken, 'no').expect(400);
      const voided = await post(ctx.dentist.accessToken).expect(200);
      expect(voided.body).toMatchObject({ status: 'VOIDED', void: { reason: 'Error en la dosis indicada' } });
      await post(ctx.dentist.accessToken).expect(409);
      await expect(
        prisma.db.$executeRaw`UPDATE "Prescription" SET "status" = 'ISSUED' WHERE "id" = ${prescriptionId}`,
      ).rejects.toThrow(/solo puede anularse/);
    });

    it('genera el PDF de la receta', async () => {
      const res = await http(app).get(`/api/prescriptions/${prescriptionId}/pdf`).set(dentist()).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.headers['content-disposition']).toMatch(/RX-\d{6}\.pdf/);
    });
  });

  describe('permisos', () => {
    it('el asistente consulta pero no receta; recepción y administrador no acceden', async () => {
      const assistant = bearer(ctx.assistant.accessToken);
      await http(app).get(url()).set(assistant).expect(200);
      await http(app).post(url()).set(assistant).send({ items: [item(ibuprofenId, 'Ibuprofeno')] }).expect(403);
      await http(app).post(`${url()}/check`).set(assistant).send({ items: [item(ibuprofenId, 'Ibuprofeno')] }).expect(403);
      for (const token of [ctx.reception.accessToken, ctx.admin.accessToken]) {
        await http(app).get(url()).set(bearer(token)).expect(403);
      }
    });

    it('emitir, anular y descargar quedan auditados', async () => {
      const actions = (await prisma.db.auditLog.findMany({ where: { entity: 'Prescription' }, select: { action: true } })).map(
        (l) => l.action,
      );
      expect(actions).toEqual(expect.arrayContaining(['CREATE', 'VOID', 'DOWNLOAD', 'CHECK', 'READ']));
    });
  });
});
