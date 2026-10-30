import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { PrismaService } from '../src/prisma/prisma.service';
import { createPatient, emptyHistory } from './fixtures';
import { bearer, createSession, http, TestSession } from './helpers';

export interface ClinicalContext {
  dentist: TestSession;
  assistant: TestSession;
  reception: TestSession;
  admin: TestSession;
  patient: { id: string };
}

/** Sesiones de cada rol y un paciente con anamnesis (alérgico a la penicilina). */
export async function clinicalSetup(app: INestApplication): Promise<ClinicalContext> {
  const dentist = await createSession(app, Role.ODONTOLOGO);
  const assistant = await createSession(app, Role.ASISTENTE);
  const reception = await createSession(app, Role.RECEPCIONISTA);
  const admin = await createSession(app, Role.ADMIN_TI);
  const patient = await createPatient(app, reception.accessToken);
  await http(app)
    .put(`/api/patients/${patient.id}/medical-history`)
    .set(bearer(reception.accessToken))
    .send({ ...emptyHistory, drugAllergies: ['Penicilina'] })
    .expect(200);
  return { dentist, assistant, reception, admin, patient };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG real (con ruido, para que pese lo de una firma) generado sin dependencias. */
export function makePng(width = 80, height = 40): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // 8 bits por canal
  header.writeUInt8(2, 9); // RGB
  const rows: Buffer[] = [];
  let seed = 7;
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let i = 1; i < row.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      row[i] = seed >> 16;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** La firma trazada en pantalla táctil, como data URL. */
export function signatureDataUrl(): string {
  return `data:image/png;base64,${makePng().toString('base64')}`;
}

/** Procedimiento nuevo (con o sin consentimiento obligatorio) y su plantilla legal vigente. */
export async function createConsentProcedure(
  app: INestApplication,
  admin: TestSession,
  options: { requiresConsent: boolean; price?: number; labCost?: number; withTemplate?: boolean },
) {
  const prisma = app.get(PrismaService);
  const code = `C-${randomUUID().slice(0, 8).toUpperCase()}`;
  const procedure = await prisma.db.procedure.create({
    data: {
      code,
      name: `Procedimiento ${code}`,
      category: 'Pruebas',
      durationMinutes: 30,
      basePrice: options.price ?? 100,
      labCost: options.labCost ?? 0,
      requiresConsent: options.requiresConsent,
    },
  });
  if (options.withTemplate !== false) {
    await http(app)
      .post('/api/clinical/consent-templates')
      .set(bearer(admin.accessToken))
      .send({
        procedureId: procedure.id,
        title: `Consentimiento ${code}`,
        body: 'Yo, {{paciente}}, autorizo a {{profesional}} a realizar «{{procedimiento}}» {{diente}} en {{clinica}}. Fecha: {{fecha}}.',
      })
      .expect(201);
  }
  return procedure;
}

/** Firma un documento (consentimiento o aprobación) en pantalla táctil. */
export function signTouch(app: INestApplication, token: string, signingId: string) {
  return http(app)
    .post(`/api/signing/${signingId}/touch`)
    .set(bearer(token))
    .send({
      signerName: 'Paciente de Prueba',
      image: signatureDataUrl(),
      strokes: 4,
      durationMs: 2300,
      pointerType: 'touch',
      maxPressure: 0.6,
    });
}

/** Consentimiento firmado de punta a punta (devuelve su id). */
export async function signedConsent(
  app: INestApplication,
  ctx: ClinicalContext,
  procedureId: string,
): Promise<string> {
  const consent = await http(app)
    .post(`/api/patients/${ctx.patient.id}/consents`)
    .set(bearer(ctx.dentist.accessToken))
    .send({ procedureId })
    .expect(201);
  await signTouch(app, ctx.dentist.accessToken, consent.body.signing.id).expect(200);
  return consent.body.id as string;
}
