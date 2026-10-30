import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EICAR_TEST_STRING } from '../src/clinical/domain/attachment-validator';
import { PrismaService } from '../src/prisma/prisma.service';
import { clinicalSetup, ClinicalContext, makePng } from './clinical-fixtures';
import { bearer, createTestApp, http } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

describe('Adjuntos: radiografías, fotos y PDFs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: ClinicalContext;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ctx = await clinicalSetup(app);
  });
  afterAll(() => app.close());

  const base = () => `/api/patients/${ctx.patient.id}/attachments`;
  const dentist = () => bearer(ctx.dentist.accessToken);
  const upload = (file: Buffer, filename: string, fields: Record<string, string> = {}, token = ctx.dentist.accessToken) => {
    let req = http(app).post(base()).set(bearer(token));
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return req.attach('file', file, filename);
  };

  const png = makePng(60, 30);
  let imageId: string;
  let pdfId: string;

  describe('subida', () => {
    it('acepta una radiografía (PNG) y guarda su huella SHA-256', async () => {
      const res = await upload(png, 'panoramica.png', { kind: 'XRAY', description: 'Panorámica inicial' }).expect(201);
      imageId = res.body.id;
      expect(res.body).toMatchObject({
        kind: 'XRAY',
        filename: 'panoramica.png',
        contentType: 'image/png',
        sizeBytes: png.length,
        description: 'Panorámica inicial',
        sha256: createHash('sha256').update(png).digest('hex'),
      });
      expect(res.body.uploadedBy).toBeTruthy();
    });

    it('acepta un PDF como documento y el asistente también puede subir', async () => {
      const res = await upload(PDF, 'informe.pdf', {}, ctx.assistant.accessToken).expect(201);
      pdfId = res.body.id;
      expect(res.body).toMatchObject({ kind: 'DOCUMENT', contentType: 'application/pdf' });
    });

    it('rechaza archivos peligrosos o que no son lo que dicen ser', async () => {
      await upload(Buffer.from('MZ\x90\x00programa'), 'foto.png').expect(400); // ejecutable disfrazado
      await upload(png, 'foto.pdf').expect(400); // extensión que no corresponde
      await upload(Buffer.from('<script>alert(1)</script>'), 'x.html').expect(400);
      await upload(Buffer.concat([png, Buffer.from(EICAR_TEST_STRING)]), 'virus.png').expect(400);
      await upload(Buffer.from('%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>'), 'activo.pdf').expect(400);
      await upload(PDF, 'rx.pdf', { kind: 'XRAY' }).expect(400); // un PDF no es radiografía
      await http(app).post(base()).set(dentist()).field('kind', 'XRAY').expect(400); // sin archivo
    });

    it('rechaza archivos de más de 15 MB', async () => {
      const big = Buffer.concat([png, Buffer.alloc(15 * 1024 * 1024 + 1024)]);
      const res = await upload(big, 'enorme.png');
      expect([400, 413]).toContain(res.status);
    });

    it('limpia el nombre del archivo y lo guarda cifrado en reposo con clave opaca', async () => {
      const res = await upload(png, '../../etc/pa ss wd.png').expect(201);
      expect(res.body.filename).not.toContain('/');
      const row = await prisma.db.attachment.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.storageKey).toMatch(new RegExp(`^attachments/${ctx.patient.id}/[0-9a-f-]{36}\\.png$`));
    });
  });

  describe('visualización y descarga', () => {
    it('lista los adjuntos del paciente', async () => {
      const list = await http(app).get(base()).set(dentist()).expect(200);
      expect(list.body.map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining([imageId, pdfId]));
    });

    it('entrega el contenido para el visor (imagen y PDF)', async () => {
      const image = await http(app).get(`${base()}/${imageId}/content`).set(dentist()).expect(200);
      expect(image.headers['content-type']).toContain('image/png');
      expect(Buffer.from(image.body).equals(png)).toBe(true);

      const pdf = await http(app).get(`${base()}/${pdfId}/content`).set(dentist()).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
    });

    it('la descarga usa una URL firmada de 60 segundos que sí funciona', async () => {
      const res = await http(app).get(`${base()}/${imageId}/download-url`).set(dentist()).expect(200);
      expect(res.body.expiresIn).toBe(60);
      expect(res.body.url).toContain('X-Amz-Expires=60');
      const file = await fetch(res.body.url);
      expect(file.status).toBe(200);
      expect(Buffer.from(await file.arrayBuffer()).equals(png)).toBe(true);
    });

    it('un adjunto no se puede pedir con el id de otro paciente', async () => {
      const other = await clinicalSetup(app);
      await http(app).get(`/api/patients/${other.patient.id}/attachments/${imageId}/content`).set(bearer(other.dentist.accessToken)).expect(404);
    });
  });

  describe('permisos, auditoría e inmutabilidad', () => {
    it('recepción y administrador no acceden', async () => {
      for (const token of [ctx.reception.accessToken, ctx.admin.accessToken]) {
        await http(app).get(base()).set(bearer(token)).expect(403);
        await http(app).get(`${base()}/${imageId}/content`).set(bearer(token)).expect(403);
        await upload(png, 'a.png', {}, token).expect(403);
      }
    });

    it('subir, ver y descargar quedan auditados', async () => {
      const actions = (await prisma.db.auditLog.findMany({ where: { entity: 'Attachment' }, select: { action: true } })).map(
        (l) => l.action,
      );
      expect(actions).toEqual(expect.arrayContaining(['CREATE', 'VIEW', 'DOWNLOAD', 'READ']));
    });

    it('no existe ruta para borrar y la base de datos tampoco lo permite', async () => {
      await http(app).delete(`${base()}/${imageId}`).set(dentist()).expect(404);
      await expect(prisma.db.$executeRaw`DELETE FROM "Attachment" WHERE "id" = ${imageId}`).rejects.toThrow(/no se pueden eliminar/);
      await expect(
        prisma.db.$executeRaw`UPDATE "Attachment" SET "filename" = 'otro.png' WHERE "id" = ${imageId}`,
      ).rejects.toThrow(/no se pueden modificar/);
    });
  });
});
