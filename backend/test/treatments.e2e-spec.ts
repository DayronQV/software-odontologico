import { INestApplication } from '@nestjs/common';
import { Procedure } from '@prisma/client';
import { createHash } from 'node:crypto';
import { BlobStorageService } from '../src/files/blob-storage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  clinicalSetup,
  ClinicalContext,
  createConsentProcedure,
  signedConsent,
  signTouch,
} from './clinical-fixtures';
import { AppointmentRequest, createChairs, createProfessional, postAppointment, slot } from './fixtures';
import { bearer, createTestApp, http } from './helpers';

describe('Plan de tratamiento, presupuesto y aprobación (RF-07, RF-08)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blobs: BlobStorageService;
  let ctx: ClinicalContext;
  let simple: Procedure; // 100 de honorarios + 20 de laboratorio
  let consent: Procedure; // 200 de honorarios, exige consentimiento
  let planId: string;
  const ids: Record<string, string> = {}; // ítems por nombre

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    blobs = app.get(BlobStorageService);
    ctx = await clinicalSetup(app);
    simple = await createConsentProcedure(app, ctx.admin, { requiresConsent: false, price: 100, labCost: 20 });
    consent = await createConsentProcedure(app, ctx.admin, { requiresConsent: true, price: 200 });
  });
  afterAll(() => app.close());

  const dentist = () => bearer(ctx.dentist.accessToken);
  const plansUrl = () => `/api/patients/${ctx.patient.id}/treatment-plans`;
  const getPlan = async () => (await http(app).get(`/api/treatment-plans/${planId}`).set(dentist()).expect(200)).body;
  const itemStatus = async (itemId: string) =>
    (await prisma.db.treatmentItem.findUniqueOrThrow({ where: { id: itemId } })).status;
  const phaseId = async (position: number) => (await getPlan()).phases.find((p: { position: number }) => p.position === position).id;

  describe('plan por fases y sesiones', () => {
    it('crea un plan con su primera fase y arma fases, sesiones e ítems', async () => {
      const created = await http(app).post(plansUrl()).set(dentist()).send({ title: 'Rehabilitación completa' }).expect(201);
      planId = created.body.id;
      expect(created.body.phases).toHaveLength(1);
      expect(created.body.phases[0].name).toBe('Fase 1');

      await http(app).post(`/api/treatment-plans/${planId}/phases`).set(dentist()).send({ name: 'Fase 2 — Restauración' }).expect(201);
      const phase1 = await phaseId(1);
      const phase2 = await phaseId(2);

      const add = (body: Record<string, unknown>) =>
        http(app).post(`/api/treatment-plans/${planId}/items`).set(dentist()).send(body).expect(201);
      await add({ phaseId: phase1, procedureId: simple.id, toothCode: 16, surface: 'OCCLUSAL', sessionNumber: 1 });
      await add({ phaseId: phase1, procedureId: consent.id, toothCode: 46, sessionNumber: 2 });
      await add({ phaseId: phase2, procedureId: simple.id, toothCode: 26, sessionNumber: 3, fee: 150, labCost: 0 });

      const plan = await getPlan();
      const items = plan.phases.flatMap((p: { items: Array<{ id: string; toothCode: number }> }) => p.items);
      expect(items).toHaveLength(3);
      // los honorarios y el laboratorio se copian del catálogo y se pueden sobrescribir
      expect(plan.phases[0].items[0]).toMatchObject({ fee: 100, labCost: 20, status: 'PENDING' });
      expect(plan.phases[1].items[0]).toMatchObject({ fee: 150, labCost: 0 });
      ids.a = items.find((i: { toothCode: number }) => i.toothCode === 16).id;
      ids.b = items.find((i: { toothCode: number }) => i.toothCode === 46).id;
      ids.c = items.find((i: { toothCode: number }) => i.toothCode === 26).id;
    });

    it('valida los ítems', async () => {
      const phase1 = await phaseId(1);
      const add = (body: Record<string, unknown>) =>
        http(app).post(`/api/treatment-plans/${planId}/items`).set(dentist()).send({ phaseId: phase1, procedureId: simple.id, ...body });
      await add({ toothCode: 19 }).expect(400);
      await add({ surface: 'MESIAL' }).expect(400); // superficie sin diente
      await add({ fee: -1 }).expect(400);
      await add({ phaseId: '11111111-1111-4111-8111-111111111111' }).expect(404);
    });

    it('un ítem pendiente se edita y se mueve de fase; el asistente solo consulta', async () => {
      const updated = await http(app)
        .patch(`/api/treatment-plans/${planId}/items/${ids.c}`)
        .set(dentist())
        .send({ fee: 160, sessionNumber: 4 })
        .expect(200);
      const item = updated.body.phases.flatMap((p: { items: Array<{ id: string }> }) => p.items).find((i: { id: string }) => i.id === ids.c);
      expect(item).toMatchObject({ fee: 160, sessionNumber: 4 });
      await http(app).patch(`/api/treatment-plans/${planId}/items/${ids.c}`).set(bearer(ctx.assistant.accessToken)).send({ fee: 1 }).expect(403);
      await http(app).get(`/api/treatment-plans/${planId}`).set(bearer(ctx.assistant.accessToken)).expect(200);
    });
  });

  describe('presupuesto: honorarios, laboratorio y descuentos', () => {
    let budgetV1: { id: string };

    it('calcula honorarios, laboratorio y totales por fase', async () => {
      const res = await http(app).post(`/api/treatment-plans/${planId}/budgets`).set(dentist()).send({}).expect(201);
      budgetV1 = res.body;
      // honorarios: 100 + 200 + 160 = 460 · laboratorio: 20 + 0 + 0 = 20
      expect(res.body).toMatchObject({
        version: 1,
        status: 'OPEN',
        subtotalFees: 460,
        subtotalLab: 20,
        discountPercent: 0,
        discountAmount: 0,
        total: 480,
      });
      expect(res.body.phases).toHaveLength(2);
      expect(res.body.phases[0]).toMatchObject({ fees: 300, lab: 20, total: 320 });
      expect(res.body.phases[1]).toMatchObject({ fees: 160, lab: 0, total: 160 });
    });

    it('un descuento dentro del umbral se aplica solo a los honorarios', async () => {
      const res = await http(app).post(`/api/treatment-plans/${planId}/budgets`).set(dentist()).send({ discountPercent: 10 }).expect(201);
      expect(res.body).toMatchObject({ version: 2, status: 'OPEN', discountAmount: 46, total: 434 });
      // la versión anterior queda reemplazada
      const v1 = await http(app).get(`/api/budgets/${budgetV1.id}`).set(dentist()).expect(200);
      expect(v1.body.status).toBe('SUPERSEDED');
    });

    it('un descuento mayor al umbral exige la autorización de un rol con permiso', async () => {
      const res = await http(app).post(`/api/treatment-plans/${planId}/budgets`).set(dentist()).send({ discountPercent: 25 }).expect(201);
      expect(res.body).toMatchObject({ version: 3, status: 'PENDING_AUTHORIZATION', discountAmount: 115, total: 365 });
      const budgetId = res.body.id;

      // no se puede aprobar mientras el descuento no esté autorizado
      await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({}).expect(409);

      // quien propone el descuento no puede autorizarlo
      await http(app).post(`/api/budgets/${budgetId}/authorize-discount`).set(dentist()).send({ note: 'Me autorizo yo' }).expect(403);
      await http(app).post(`/api/budgets/${budgetId}/authorize-discount`).set(bearer(ctx.admin.accessToken)).send({ note: 'x' }).expect(400);

      const pending = await http(app).get('/api/budgets/pending-authorization').set(bearer(ctx.admin.accessToken)).expect(200);
      expect(pending.body.map((b: { id: string }) => b.id)).toContain(budgetId);

      const authorized = await http(app)
        .post(`/api/budgets/${budgetId}/authorize-discount`)
        .set(bearer(ctx.admin.accessToken))
        .send({ note: 'Paciente de convenio, aprobado por gerencia' })
        .expect(200);
      expect(authorized.body.status).toBe('OPEN');
      expect(authorized.body.discountAuthorization).toMatchObject({ note: 'Paciente de convenio, aprobado por gerencia' });
      await http(app).post(`/api/budgets/${budgetId}/authorize-discount`).set(bearer(ctx.admin.accessToken)).send({ note: 'otra vez ok' }).expect(409);
    });

    it('no se presupuesta un plan sin ítems', async () => {
      const empty = await http(app).post(plansUrl()).set(dentist()).send({ title: 'Plan vacío' }).expect(201);
      await http(app).post(`/api/treatment-plans/${empty.body.id}/budgets`).set(dentist()).send({}).expect(400);
    });

    it('el administrador ve los importes pero recepción no accede al contenido clínico', async () => {
      const list = await http(app).get(`/api/treatment-plans/${planId}/budgets`).set(dentist()).expect(200);
      expect(list.body.map((b: { version: number }) => b.version)).toEqual([3, 2, 1]);
      await http(app).get(`/api/budgets/${list.body[0].id}`).set(bearer(ctx.admin.accessToken)).expect(200);
      await http(app).get(`/api/budgets/${list.body[0].id}`).set(bearer(ctx.reception.accessToken)).expect(403);
      await http(app).get(`/api/treatment-plans/${planId}`).set(bearer(ctx.reception.accessToken)).expect(403);
    });

    it('genera el PDF del presupuesto', async () => {
      const list = await http(app).get(`/api/treatment-plans/${planId}/budgets`).set(dentist()).expect(200);
      const pdf = await http(app).get(`/api/budgets/${list.body[0].id}/pdf`).set(dentist()).expect(200);
      expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('aprobación parcial: solo lo aprobado queda agendable (RF-08)', () => {
    let budgetId: string;
    let approvalId: string;

    beforeAll(async () => {
      // versión limpia sin descuento para razonar con números simples
      const res = await http(app).post(`/api/treatment-plans/${planId}/budgets`).set(dentist()).send({}).expect(201);
      budgetId = res.body.id;
    });

    it('antes de aprobar no hay tareas agendables', async () => {
      const res = await http(app).get(`/api/patients/${ctx.patient.id}/schedulable-items`).set(bearer(ctx.reception.accessToken)).expect(200);
      expect(res.body).toEqual([]);
    });

    it('valida qué ítems se aprueban', async () => {
      await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({ itemIds: [] }).expect(400);
      await http(app)
        .post(`/api/budgets/${budgetId}/approvals`)
        .set(dentist())
        .send({ itemIds: ['11111111-1111-4111-8111-111111111111'] })
        .expect(400);
    });

    it('prepara una aprobación parcial por el importe de los ítems elegidos y la firma el paciente', async () => {
      const res = await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({ itemIds: [ids.a] }).expect(201);
      approvalId = res.body.id;
      expect(res.body).toMatchObject({ itemIds: [ids.a], approvedTotal: 120, signing: { status: 'PENDING' } });
      // hasta que el paciente firme, nada cambia
      expect(await itemStatus(ids.a)).toBe('PENDING');

      // pedir lo mismo no duplica; pedir otra cosa mientras hay una pendiente se rechaza
      const again = await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({ itemIds: [ids.a] }).expect(201);
      expect(again.body.id).toBe(approvalId);
      await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({ itemIds: [ids.b] }).expect(409);

      const signed = await signTouch(app, ctx.dentist.accessToken, res.body.signing.id).expect(200);
      expect(signed.body.status).toBe('SIGNED');
    });

    it('solo el ítem aprobado pasa a ser agendable; los demás siguen pendientes', async () => {
      expect(await itemStatus(ids.a)).toBe('APPROVED');
      expect(await itemStatus(ids.b)).toBe('PENDING');
      expect(await itemStatus(ids.c)).toBe('PENDING');

      const budget = await http(app).get(`/api/budgets/${budgetId}`).set(dentist()).expect(200);
      expect(budget.body.status).toBe('PARTIALLY_APPROVED');

      const tasks = await http(app).get(`/api/patients/${ctx.patient.id}/schedulable-items`).set(bearer(ctx.reception.accessToken)).expect(200);
      expect(tasks.body).toHaveLength(1);
      expect(tasks.body[0]).toMatchObject({ id: ids.a, toothCode: 16, status: 'APPROVED' });
      expect(tasks.body[0].procedure.id).toBe(simple.id);
      // recepción ve qué agendar, no los importes
      expect(JSON.stringify(tasks.body)).not.toMatch(/"fee"|"labCost"|"total"/);
    });

    it('el PDF de la aprobación queda firmado y almacenado con su huella', async () => {
      const approval = await prisma.db.budgetApproval.findUniqueOrThrow({ where: { id: approvalId } });
      expect(approval.pdfKey).toContain(`budgets/${ctx.patient.id}/`);
      const stored = await blobs.get(approval.pdfKey!);
      expect(stored.subarray(0, 5).toString()).toBe('%PDF-');
      expect(createHash('sha256').update(stored).digest('hex')).toBe(approval.pdfHash);
      await expect(
        prisma.db.$executeRaw`UPDATE "BudgetApproval" SET "pdfHash" = 'x' WHERE "id" = ${approvalId}`,
      ).rejects.toThrow(/documento firmado/);
    });

    it('un ítem ya aprobado no se vuelve a aprobar; el resto se aprueba después', async () => {
      await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({ itemIds: [ids.a] }).expect(400);

      const rest = await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({}).expect(201); // todos los pendientes
      expect(rest.body.itemIds.sort()).toEqual([ids.b, ids.c].sort());
      expect(rest.body.approvedTotal).toBe(360);
      await signTouch(app, ctx.dentist.accessToken, rest.body.signing.id).expect(200);

      const budget = await http(app).get(`/api/budgets/${budgetId}`).set(dentist()).expect(200);
      expect(budget.body.status).toBe('APPROVED');
      await http(app).post(`/api/budgets/${budgetId}/approvals`).set(dentist()).send({}).expect(409);
    });

    it('un ítem aprobado ya no se edita ni se elimina, solo se cancela', async () => {
      await http(app).patch(`/api/treatment-plans/${planId}/items/${ids.a}`).set(dentist()).send({ fee: 1 }).expect(409);
      await http(app).delete(`/api/treatment-plans/${planId}/items/${ids.a}`).set(dentist()).expect(409);
    });

    it('el paciente puede aprobar con código OTP en lugar de firma táctil', async () => {
      const plan = await http(app).post(plansUrl()).set(dentist()).send({ title: 'Plan con OTP' }).expect(201);
      const phase = plan.body.phases[0].id;
      await http(app).post(`/api/treatment-plans/${plan.body.id}/items`).set(dentist()).send({ phaseId: phase, procedureId: simple.id, toothCode: 11 }).expect(201);
      const budget = await http(app).post(`/api/treatment-plans/${plan.body.id}/budgets`).set(dentist()).send({}).expect(201);
      const approval = await http(app).post(`/api/budgets/${budget.body.id}/approvals`).set(dentist()).send({}).expect(201);

      await http(app).post(`/api/signing/${approval.body.signing.id}/otp`).set(dentist()).expect(200);
      expect((await http(app).get(`/api/budget-approvals/${approval.body.id}`).set(dentist()).expect(200)).body.signing.otp).toMatchObject({
        attemptsLeft: 3,
      });
      await http(app)
        .post(`/api/signing/${approval.body.signing.id}/otp/verify`)
        .set(dentist())
        .send({ code: '000000', signerName: 'Paciente' })
        .expect(400);
      const pdf = await http(app).get(`/api/budget-approvals/${approval.body.id}/pdf`).set(dentist()).expect(200);
      expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-'); // vista previa antes de firmar
    });
  });

  describe('agendar desde la agenda y completar (RN-01)', () => {
    let professionalId: string;
    let chairId: string;
    let planB: { planId: string; itemApproved: string; itemOther: string };

    /** Plan nuevo con un ítem aprobado y otro pendiente. */
    async function approvedPlan(): Promise<{ planId: string; itemApproved: string; itemOther: string; procedureId: string }> {
      const plan = await http(app).post(plansUrl()).set(dentist()).send({ title: `Plan ${Date.now()}` }).expect(201);
      const phase = plan.body.phases[0].id;
      const add = (procedureId: string, toothCode: number) =>
        http(app).post(`/api/treatment-plans/${plan.body.id}/items`).set(dentist()).send({ phaseId: phase, procedureId, toothCode }).expect(201);
      await add(simple.id, 21);
      const withTwo = (await add(consent.id, 22)).body;
      const items = withTwo.phases[0].items as Array<{ id: string; toothCode: number }>;
      const budget = await http(app).post(`/api/treatment-plans/${plan.body.id}/budgets`).set(dentist()).send({}).expect(201);
      const itemApproved = items.find((i) => i.toothCode === 21)!.id;
      const approval = await http(app)
        .post(`/api/budgets/${budget.body.id}/approvals`)
        .set(dentist())
        .send({ itemIds: [itemApproved] })
        .expect(201);
      await signTouch(app, ctx.dentist.accessToken, approval.body.signing.id).expect(200);
      return { planId: plan.body.id, itemApproved, itemOther: items.find((i) => i.toothCode === 22)!.id, procedureId: simple.id };
    }

    beforeAll(async () => {
      const { chairs } = await createChairs(app, 1);
      chairId = chairs[0].id;
      professionalId = (await createProfessional(app)).professionalId;
      planB = await approvedPlan();
    });

    const book = (body: Partial<AppointmentRequest>, day = 6, hour = 10) =>
      postAppointment(app, ctx.reception.accessToken, {
        patientId: ctx.patient.id,
        professionalId,
        chairId,
        procedureIds: [simple.id],
        ...slot(day, hour),
        ...body,
      });

    it('solo se agendan ítems aprobados, del paciente y con su procedimiento', async () => {
      const pending = await book({ treatmentItemIds: [planB.itemOther], procedureIds: [consent.id] }).expect(409);
      expect(pending.body.message).toMatch(/aprobados/);
      await book({ treatmentItemIds: ['11111111-1111-4111-8111-111111111111'] }).expect(400);
      await book({ treatmentItemIds: [planB.itemApproved], procedureIds: [consent.id] }).expect(400); // falta el procedimiento del ítem
    });

    it('al agendar, el ítem se vincula a la cita y deja de estar disponible', async () => {
      const res = await book({ treatmentItemIds: [planB.itemApproved] }, 6, 11).expect(201);
      expect(res.body.origin).toBe('TREATMENT_BUDGET');
      const item = await prisma.db.treatmentItem.findUniqueOrThrow({ where: { id: planB.itemApproved } });
      expect(item).toMatchObject({ status: 'SCHEDULED', appointmentId: res.body.id });

      // recepción lo ve como agendado, con su cita
      const tasks = await http(app).get(`/api/patients/${ctx.patient.id}/schedulable-items`).set(bearer(ctx.reception.accessToken)).expect(200);
      expect(tasks.body.find((t: { id: string }) => t.id === planB.itemApproved)).toMatchObject({
        status: 'SCHEDULED',
        appointment: { id: res.body.id },
      });
      // y no se puede agendar dos veces
      await book({ treatmentItemIds: [planB.itemApproved] }, 7, 11).expect(409);

      // cancelar la cita lo devuelve a la lista de tareas agendables
      await http(app)
        .post(`/api/agenda/appointments/${res.body.id}/status`)
        .set(bearer(ctx.reception.accessToken))
        .send({ to: 'CANCELED', reason: 'El paciente pidió otra fecha' })
        .expect(200);
      const back = await prisma.db.treatmentItem.findUniqueOrThrow({ where: { id: planB.itemApproved } });
      expect(back).toMatchObject({ status: 'APPROVED', appointmentId: null });
    });

    it('al completarse, el ítem pasa a Realizado y queda protegido (RN-01)', async () => {
      const record = (itemId: string, procedureId: string) =>
        http(app)
          .post(`/api/patients/${ctx.patient.id}/procedure-records`)
          .set(dentist())
          .send({ procedureId, treatmentItemId: itemId, toothCode: 21 });

      await record(planB.itemApproved, consent.id).expect(400); // procedimiento distinto al del ítem
      await record(planB.itemOther, consent.id).expect(409); // el ítem aún no fue aprobado
      await http(app)
        .post(`/api/patients/${ctx.patient.id}/procedure-records`)
        .set(bearer(ctx.assistant.accessToken))
        .send({ procedureId: simple.id, treatmentItemId: planB.itemApproved })
        .expect(403);

      const done = await record(planB.itemApproved, simple.id).expect(201);
      expect(done.body.treatmentItemId).toBe(planB.itemApproved);
      expect(await itemStatus(planB.itemApproved)).toBe('DONE');
      await record(planB.itemApproved, simple.id).expect(409); // no se completa dos veces

      // un ítem realizado no se puede cancelar, editar ni borrar: ni por la API ni por SQL
      await http(app).post(`/api/treatment-plans/${planB.planId}/items/${planB.itemApproved}/cancel`).set(dentist()).expect(409);
      await http(app).delete(`/api/treatment-plans/${planB.planId}/items/${planB.itemApproved}`).set(dentist()).expect(409);
      await expect(
        prisma.db.$executeRaw`DELETE FROM "TreatmentItem" WHERE "id" = ${planB.itemApproved}`,
      ).rejects.toThrow(/pendientes o cancelados/);
      await expect(
        prisma.db.$executeRaw`UPDATE "TreatmentItem" SET "fee" = 1 WHERE "id" = ${planB.itemApproved}`,
      ).rejects.toThrow(/realizado no se puede modificar/);
    });

    it('un ítem cuyo procedimiento exige consentimiento no se completa sin consentimiento firmado', async () => {
      const plan = await approvedConsentPlan();
      const post = () =>
        http(app)
          .post(`/api/patients/${ctx.patient.id}/procedure-records`)
          .set(dentist())
          .send({ procedureId: consent.id, treatmentItemId: plan.item });
      const blocked = await post().expect(409);
      expect(blocked.body.message).toMatch(/consentimiento/);
      expect(await itemStatus(plan.item)).toBe('APPROVED');

      await signedConsent(app, ctx, consent.id);
      await post().expect(201);
      expect(await itemStatus(plan.item)).toBe('DONE');
    });

    async function approvedConsentPlan() {
      const plan = await http(app).post(plansUrl()).set(dentist()).send({ title: 'Plan con consentimiento' }).expect(201);
      const created = await http(app)
        .post(`/api/treatment-plans/${plan.body.id}/items`)
        .set(dentist())
        .send({ phaseId: plan.body.phases[0].id, procedureId: consent.id, toothCode: 36 })
        .expect(201);
      const item = created.body.phases[0].items[0].id as string;
      const budget = await http(app).post(`/api/treatment-plans/${plan.body.id}/budgets`).set(dentist()).send({}).expect(201);
      const approval = await http(app).post(`/api/budgets/${budget.body.id}/approvals`).set(dentist()).send({}).expect(201);
      await signTouch(app, ctx.dentist.accessToken, approval.body.signing.id).expect(200);
      return { item };
    }

    it('un ítem pendiente o aprobado se puede cancelar y sale de los siguientes presupuestos', async () => {
      const plan = await http(app).post(plansUrl()).set(dentist()).send({ title: 'Plan a cancelar' }).expect(201);
      const phase = plan.body.phases[0].id;
      const add = async (tooth: number) =>
        (await http(app).post(`/api/treatment-plans/${plan.body.id}/items`).set(dentist()).send({ phaseId: phase, procedureId: simple.id, toothCode: tooth }).expect(201)).body;
      await add(31);
      const two = await add(32);
      const [first, second] = two.phases[0].items as Array<{ id: string }>;
      await http(app).post(`/api/treatment-plans/${plan.body.id}/items/${first.id}/cancel`).set(dentist()).expect(200);
      const budget = await http(app).post(`/api/treatment-plans/${plan.body.id}/budgets`).set(dentist()).send({}).expect(201);
      const lines = budget.body.phases.flatMap((p: { lines: Array<{ itemId: string }> }) => p.lines);
      expect(lines.map((l: { itemId: string }) => l.itemId)).toEqual([second.id]);

      // un plan cerrado no admite más cambios
      await http(app).post(`/api/treatment-plans/${plan.body.id}/close`).set(dentist()).expect(200);
      await http(app).post(`/api/treatment-plans/${plan.body.id}/items`).set(dentist()).send({ phaseId: phase, procedureId: simple.id }).expect(409);
    });
  });

  describe('auditoría y protección en la base de datos', () => {
    it('los presupuestos y planes no se borran y la aprobación queda auditada', async () => {
      await expect(prisma.db.$executeRaw`DELETE FROM "Budget"`).rejects.toThrow(/no se pueden eliminar/);
      await expect(prisma.db.$executeRaw`DELETE FROM "TreatmentPlan"`).rejects.toThrow(/no se pueden eliminar/);
      await expect(prisma.db.$executeRaw`UPDATE "BudgetLine" SET "fee" = 0`).rejects.toThrow(/no se pueden modificar/);
      await expect(prisma.db.$executeRawUnsafe('TRUNCATE "TreatmentItem" CASCADE')).rejects.toThrow(/vaciar/);

      const actions = (await prisma.db.auditLog.findMany({ where: { entity: 'Budget' }, select: { action: true } })).map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['CREATE', 'AUTHORIZE_DISCOUNT', 'DOWNLOAD', 'READ']));
    });
  });
});
