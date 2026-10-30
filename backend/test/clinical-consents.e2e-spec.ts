import { INestApplication } from '@nestjs/common';
import { ContactChannel } from '@prisma/client';
import { createHash } from 'node:crypto';
import { BlobStorageService } from '../src/files/blob-storage.service';
import { MESSAGING_CHANNELS, type MessagingChannel, type OutboundMessage } from '../src/integrations/messaging/messaging-channel';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicalSetup, ClinicalContext, createConsentProcedure, signatureDataUrl, signTouch } from './clinical-fixtures';
import { createPatient } from './fixtures';
import { bearer, createTestApp, http } from './helpers';

/** Canal falso que guarda los mensajes para poder leer el código OTP enviado. */
class CapturingChannel implements MessagingChannel {
  readonly sent: OutboundMessage[] = [];
  constructor(readonly channel: ContactChannel) {}
  async send(message: OutboundMessage) {
    this.sent.push(message);
    return { providerMessageId: `test-${this.sent.length}` };
  }
}

const whatsapp = new CapturingChannel(ContactChannel.WHATSAPP);
const sms = new CapturingChannel(ContactChannel.SMS);
const email = new CapturingChannel(ContactChannel.EMAIL);
const lastCode = (channel: CapturingChannel) => /\b(\d{6})\b/.exec(channel.sent.at(-1)?.body ?? '')?.[1] ?? '';

describe('Consentimiento informado (RF-06)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let blobs: BlobStorageService;
  let ctx: ClinicalContext;

  beforeAll(async () => {
    app = await createTestApp([], (builder) =>
      builder.overrideProvider(MESSAGING_CHANNELS).useValue([whatsapp, sms, email]),
    );
    prisma = app.get(PrismaService);
    blobs = app.get(BlobStorageService);
    ctx = await clinicalSetup(app);
  });
  afterAll(() => app.close());

  const dentist = () => bearer(ctx.dentist.accessToken);
  const consentsUrl = (patientId = ctx.patient.id) => `/api/patients/${patientId}/consents`;
  const createConsent = (procedureId: string, token = ctx.dentist.accessToken, patientId = ctx.patient.id) =>
    http(app).post(consentsUrl(patientId)).set(bearer(token)).send({ procedureId });

  describe('plantillas por procedimiento', () => {
    it('el administrador crea versiones nuevas; la anterior queda inactiva', async () => {
      const procedure = await createConsentProcedure(app, ctx.admin, { requiresConsent: true });
      const body = (title: string) => ({ procedureId: procedure.id, title, body: `${title}. `.repeat(10) });

      const v2 = await http(app).post('/api/clinical/consent-templates').set(bearer(ctx.admin.accessToken)).send(body('Segunda versión')).expect(201);
      expect(v2.body.version).toBe(2);

      const active = await http(app).get(`/api/clinical/consent-templates?procedureId=${procedure.id}`).set(dentist()).expect(200);
      expect(active.body).toHaveLength(1);
      expect(active.body[0]).toMatchObject({ version: 2, title: 'Segunda versión' });

      const versions = await prisma.db.consentTemplate.findMany({ where: { procedureId: procedure.id }, orderBy: { version: 'asc' } });
      expect(versions.map((v) => v.active)).toEqual([false, true]);
    });

    it('solo el administrador edita; el texto de una versión es inmutable', async () => {
      const procedure = await createConsentProcedure(app, ctx.admin, { requiresConsent: true });
      await http(app)
        .post('/api/clinical/consent-templates')
        .set(dentist())
        .send({ procedureId: procedure.id, title: 'Intento', body: 'x'.repeat(60) })
        .expect(403);
      const template = await prisma.db.consentTemplate.findFirstOrThrow({ where: { procedureId: procedure.id } });
      await expect(
        prisma.db.$executeRaw`UPDATE "ConsentTemplate" SET "body" = 'texto alterado' WHERE "id" = ${template.id}`,
      ).rejects.toThrow(/versión nueva/);
    });

    it('sin plantilla vigente no se puede generar el documento', async () => {
      const procedure = await createConsentProcedure(app, ctx.admin, { requiresConsent: true, withTemplate: false });
      await createConsent(procedure.id).expect(409);
    });
  });

  describe('firma en pantalla táctil', () => {
    let procedureId: string;
    let consentId: string;
    let signingId: string;

    it('genera el documento con los datos del paciente, el procedimiento y el profesional', async () => {
      procedureId = (await createConsentProcedure(app, ctx.admin, { requiresConsent: true })).id;
      const res = await createConsent(procedureId).expect(201);
      consentId = res.body.id;
      signingId = res.body.signing.id;

      expect(res.body.signing).toMatchObject({ status: 'PENDING', method: null });
      expect(res.body.text).toContain('Paciente');
      expect(res.body.text).toContain(res.body.procedure.name);
      expect(res.body.text).toContain('Usuario ODONTOLOGO');
      expect(res.body.text).not.toMatch(/\{\{/);
      expect(res.body.hasPdf).toBe(false);

      // pedir otra vez lo mismo reutiliza el pendiente
      const again = await createConsent(procedureId).expect(201);
      expect(again.body.id).toBe(consentId);
    });

    it('antes de firmar solo hay una vista previa del PDF', async () => {
      const res = await http(app).get(`/api/consents/${consentId}/pdf`).set(dentist()).expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('rechaza una firma que no es una imagen PNG válida', async () => {
      const post = (image: string) =>
        http(app).post(`/api/signing/${signingId}/touch`).set(dentist()).send({ signerName: 'Paciente', image });
      await post('hola').expect(400);
      await post('data:image/png;base64,AAAA').expect(400);
      await post(`data:image/jpeg;base64,${Buffer.alloc(300).toString('base64')}`).expect(400);
      await http(app).post(`/api/signing/${signingId}/touch`).set(dentist()).send({ image: signatureDataUrl() }).expect(400); // falta el nombre
    });

    it('firma, guarda el trazo con sus metadatos y genera un PDF firmado con huella de integridad', async () => {
      const res = await signTouch(app, ctx.dentist.accessToken, signingId).expect(200);
      expect(res.body).toMatchObject({ status: 'SIGNED', method: 'TOUCH', signerName: 'Paciente de Prueba', signerRelation: 'PACIENTE' });
      expect(res.body.evidenceHash).toMatch(/^[0-9a-f]{64}$/);

      const signing = await prisma.db.signingRequest.findUniqueOrThrow({ where: { id: signingId } });
      expect(signing.signatureMeta).toMatchObject({ strokes: 4, durationMs: 2300, pointerType: 'touch', maxPressure: 0.6 });
      expect(signing.signatureImageKey).toContain('signatures/');
      expect((await blobs.get(signing.signatureImageKey!)).subarray(0, 4).toString('hex')).toBe('89504e47');

      const consent = await prisma.db.patientConsent.findUniqueOrThrow({ where: { id: consentId } });
      expect(consent.pdfKey).toContain(`consents/${ctx.patient.id}/`);
      const stored = await blobs.get(consent.pdfKey!);
      expect(stored.subarray(0, 5).toString()).toBe('%PDF-');
      expect(createHash('sha256').update(stored).digest('hex')).toBe(consent.pdfHash);

      const download = await http(app).get(`/api/consents/${consentId}/pdf`).set(dentist()).expect(200);
      expect(createHash('sha256').update(Buffer.from(download.body)).digest('hex')).toBe(consent.pdfHash);
    });

    it('no se puede firmar dos veces y la firma realizada no se altera (trigger SQL)', async () => {
      await signTouch(app, ctx.dentist.accessToken, signingId).expect(409);
      await expect(
        prisma.db.$executeRaw`UPDATE "SigningRequest" SET "signerName" = 'Otra persona' WHERE "id" = ${signingId}`,
      ).rejects.toThrow(/firma realizada/);
      await expect(
        prisma.db.$executeRaw`UPDATE "PatientConsent" SET "pdfHash" = 'x' WHERE "id" = ${consentId}`,
      ).rejects.toThrow(/documento firmado/);
    });

    it('el procedimiento "requiere consentimiento" se bloquea hasta que exista uno firmado', async () => {
      const other = await createConsentProcedure(app, ctx.admin, { requiresConsent: true });
      const register = (procedure: string) =>
        http(app).post(`/api/patients/${ctx.patient.id}/procedure-records`).set(dentist()).send({ procedureId: procedure, toothCode: 36 });

      const blocked = await register(other.id).expect(409);
      expect(blocked.body.message).toMatch(/consentimiento informado firmado/);
      await register(procedureId).expect(201); // el firmado sí

      // un consentimiento pendiente (sin firmar) no basta
      await createConsent(other.id).expect(201);
      await register(other.id).expect(409);
    });
  });

  describe('firma por código OTP', () => {
    let procedureId: string;

    beforeAll(async () => {
      procedureId = (await createConsentProcedure(app, ctx.admin, { requiresConsent: true })).id;
    });

    const open = async (patientId = ctx.patient.id) => {
      const res = await createConsent(procedureId, ctx.dentist.accessToken, patientId).expect(201);
      return res.body.signing.id as string;
    };
    const send = (signingId: string) => http(app).post(`/api/signing/${signingId}/otp`).set(dentist());
    const verify = (signingId: string, code: string) =>
      http(app).post(`/api/signing/${signingId}/otp/verify`).set(dentist()).send({ code, signerName: 'Paciente de Prueba' });

    it('envía el código al canal preferido del paciente y lo valida', async () => {
      const signingId = await open();
      await verify(signingId, '123456').expect(409); // todavía no se envió

      const sent = await send(signingId).expect(200);
      expect(sent.body.otp).toMatchObject({ sentTo: expect.stringContaining('••'), attemptsLeft: 3 });
      expect(whatsapp.sent.at(-1)?.body).toMatch(/código para firmar/);

      const done = await verify(signingId, lastCode(whatsapp)).expect(200);
      expect(done.body).toMatchObject({ status: 'SIGNED', method: 'OTP', signerRelation: 'PACIENTE' });

      const consent = await prisma.db.patientConsent.findFirstOrThrow({ where: { signingId } });
      expect(consent.pdfKey).toBeTruthy();
      expect((await prisma.db.signingRequest.findUniqueOrThrow({ where: { id: signingId } })).otpHash).toBeNull(); // el código se descarta
      await verify(signingId, lastCode(whatsapp)).expect(409); // un código no se reutiliza
    });

    it('código incorrecto: cuenta los intentos y a los 3 fallos queda agotado', async () => {
      const signingId = await open(await newPatient());
      await send(signingId).expect(200);
      const good = lastCode(whatsapp);
      const wrong = good === '000000' ? '111111' : '000000';

      const first = await verify(signingId, wrong).expect(400);
      expect(first.body.message).toMatch(/Intentos restantes: 2/);
      await verify(signingId, wrong).expect(400);
      await verify(signingId, wrong).expect(400);
      const exhausted = await verify(signingId, good).expect(409); // ya con el código correcto
      expect(exhausted.body.message).toMatch(/intentos/);

      // un código nuevo reinicia los intentos y vuelve a permitir firmar
      await send(signingId).expect(200);
      await verify(signingId, lastCode(whatsapp)).expect(200);
    });

    it('un código vencido se rechaza', async () => {
      const signingId = await open(await newPatient());
      await send(signingId).expect(200);
      const code = lastCode(whatsapp);
      await prisma.db.signingRequest.update({
        where: { id: signingId },
        data: { otpExpiresAt: new Date(Date.now() - 60_000) },
      });
      const expired = await verify(signingId, code).expect(409);
      expect(expired.body.message).toMatch(/venció/);

      await send(signingId).expect(200); // uno nuevo sí sirve
      await verify(signingId, lastCode(whatsapp)).expect(200);
    });

    it('el código solo sirve para su solicitud y nunca se guarda en claro', async () => {
      const [a, b] = [await open(await newPatient()), await open(await newPatient())];
      await send(a).expect(200);
      const codeA = lastCode(whatsapp);
      await send(b).expect(200);
      await verify(b, codeA === lastCode(whatsapp) ? '999999' : codeA).expect(400);
      const row = await prisma.db.signingRequest.findUniqueOrThrow({ where: { id: a } });
      expect(row.otpHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.otpHash).not.toContain(codeA);
    });

    it('a un menor de edad el código se le envía a su tutor legal', async () => {
      const minorId = await newPatient({
        birthDate: '2018-03-10',
        guardian: { fullName: 'Laura Tutora', relationship: 'Madre', phone: '+593 97 000 1111', email: 'tutora@correo.test' },
        preferredChannel: ContactChannel.EMAIL,
      });
      const signingId = await open(minorId);
      const before = email.sent.length;
      const sent = await send(signingId).expect(200);
      expect(sent.body.suggestedSignerName).toBe('Laura Tutora');
      expect(email.sent.length).toBe(before + 1);
      expect(email.sent.at(-1)?.to).toBe('tutora@correo.test');

      const done = await verify(signingId, lastCode(email)).expect(200);
      expect(done.body.signerRelation).toBe('TUTOR');
    });

    it('sin teléfono ni correo no hay a quién enviar el código', async () => {
      const patientId = await newPatient({ phone: undefined, email: undefined });
      const signingId = await open(patientId);
      await send(signingId).expect(409);
    });

    async function newPatient(overrides: Record<string, unknown> = {}): Promise<string> {
      const patient = await createPatient(app, ctx.reception.accessToken, overrides);
      await http(app)
        .put(`/api/patients/${patient.id}/medical-history`)
        .set(bearer(ctx.reception.accessToken))
        .send({ systemicDiseases: [], drugAllergies: [], coagulopathies: [], anticoagulated: false })
        .expect(200);
      return patient.id;
    }
  });

  describe('permisos y auditoría', () => {
    it('el asistente prepara y firma junto al paciente; recepción y administrador no acceden', async () => {
      const procedure = await createConsentProcedure(app, ctx.admin, { requiresConsent: true });
      // el asistente no es odontólogo: debe indicar quién es el responsable
      await createConsent(procedure.id, ctx.assistant.accessToken).expect(400);
      const res = await http(app)
        .post(consentsUrl())
        .set(bearer(ctx.assistant.accessToken))
        .send({ procedureId: procedure.id, professionalId: ctx.dentist.user.id })
        .expect(201);
      await signTouch(app, ctx.assistant.accessToken, res.body.signing.id).expect(200);

      for (const token of [ctx.reception.accessToken, ctx.admin.accessToken]) {
        await http(app).get(consentsUrl()).set(bearer(token)).expect(403);
        await http(app).get(`/api/consents/${res.body.id}`).set(bearer(token)).expect(403);
        await http(app).get(`/api/signing/${res.body.signing.id}`).set(bearer(token)).expect(403);
      }
    });

    it('firmar y descargar quedan en la auditoría', async () => {
      await http(app).get(consentsUrl()).set(dentist()).expect(200);
      const actions = (
        await prisma.db.auditLog.findMany({ where: { entity: { in: ['Signing', 'PatientConsent'] } }, select: { action: true } })
      ).map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['SIGN', 'SEND_OTP', 'DOWNLOAD', 'CREATE', 'READ']));
    });
  });
});
