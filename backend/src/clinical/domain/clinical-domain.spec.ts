import { AttachmentKind, FindingType, ToothSurface } from '@prisma/client';
import { findAllergyConflicts } from './allergy-check';
import {
  EICAR_TEST_STRING,
  MAX_ATTACHMENT_BYTES,
  detectContentType,
  validateUpload,
} from './attachment-validator';
import { validateFindingTarget } from './finding-catalog';
import { computeLockAt, isNoteLocked } from './note-lock';
import {
  clinicalAttachmentLevel,
  compareSites,
  summarizePerio,
  type SiteReading,
} from './perio-calculations';
import { canonicalJson, sha256, signatureHash, verifySignatureHash } from './signature';

describe('cálculo del NIC y resumen periodontal (RF-04)', () => {
  it('NIC = profundidad al sondaje + recesión', () => {
    expect(clinicalAttachmentLevel(3, 2)).toBe(5);
    expect(clinicalAttachmentLevel(4, 0)).toBe(4);
    expect(clinicalAttachmentLevel(3, -1)).toBe(2); // encía que cubre la unión cemento-esmalte
    expect(clinicalAttachmentLevel(0, 0)).toBe(0);
    expect(clinicalAttachmentLevel(7, 3)).toBe(10);
  });

  const reading = (
    toothCode: number,
    site: string,
    probingDepth: number,
    gingivalMargin: number,
    bleeding: boolean,
  ): SiteReading => ({ toothCode, site, probingDepth, gingivalMargin, bleeding });

  const readings = [
    reading(16, 'V_MESIAL', 3, 1, false),
    reading(16, 'V_MIDDLE', 4, 0, true),
    reading(16, 'V_DISTAL', 6, 2, true),
    reading(26, 'V_MESIAL', 2, 0, false),
  ];

  it('% de sangrado, bolsas ≥ 4 mm y promedios', () => {
    expect(summarizePerio(readings)).toEqual({
      sites: 4,
      teeth: 2,
      bleedingSites: 2,
      bleedingPercent: 50,
      pocketSites: 2,
      pocketPercent: 50,
      meanProbingDepth: 3.8,
      meanAttachmentLevel: 4.5,
    });
  });

  it('un examen vacío no divide entre cero', () => {
    expect(summarizePerio([])).toMatchObject({ sites: 0, bleedingPercent: 0, pocketPercent: 0, meanProbingDepth: 0 });
  });

  it('compara dos exámenes punto por punto', () => {
    const after = [
      reading(16, 'V_MESIAL', 2, 1, false), // mejoró
      reading(16, 'V_MIDDLE', 4, 0, false), // igual
      reading(16, 'V_DISTAL', 7, 2, true), // empeoró
      reading(36, 'V_MESIAL', 3, 0, false), // no estaba antes: se ignora
    ];
    const changes = compareSites(readings, after);
    expect(changes).toHaveLength(3);
    expect(changes.find((c) => c.site === 'V_MESIAL')).toMatchObject({ probingDepthChange: -1, attachmentLevelChange: -1 });
    expect(changes.find((c) => c.site === 'V_MIDDLE')).toMatchObject({ probingDepthChange: 0 });
    expect(changes.find((c) => c.site === 'V_DISTAL')).toMatchObject({ probingDepthChange: 1, attachmentLevelChange: 1 });
  });
});

describe('catálogo de hallazgos del odontograma (RF-03)', () => {
  it('caries, restauración y sellante van en una superficie', () => {
    for (const type of [FindingType.CARIES, FindingType.RESTORATION, FindingType.SEALANT]) {
      expect(validateFindingTarget(16, ToothSurface.OCCLUSAL, type)).toBeNull();
      expect(validateFindingTarget(16, ToothSurface.WHOLE, type)).not.toBeNull();
    }
  });

  it('endodoncia, prótesis, implante y exodoncia van en el diente completo', () => {
    for (const type of [
      FindingType.ENDODONTICS_DONE,
      FindingType.ENDODONTICS_REQUIRED,
      FindingType.PROSTHESIS_FIXED,
      FindingType.PROSTHESIS_REMOVABLE,
      FindingType.EXTRACTION,
      FindingType.IMPLANT,
    ]) {
      expect(validateFindingTarget(36, ToothSurface.WHOLE, type)).toBeNull();
      expect(validateFindingTarget(36, ToothSurface.MESIAL, type)).not.toBeNull();
    }
  });

  it('el implante solo existe en dentición permanente y el diente debe existir', () => {
    expect(validateFindingTarget(55, ToothSurface.WHOLE, FindingType.IMPLANT)).toMatch(/permanentes/);
    expect(validateFindingTarget(55, ToothSurface.WHOLE, FindingType.EXTRACTION)).toBeNull();
    expect(validateFindingTarget(19, ToothSurface.WHOLE, FindingType.EXTRACTION)).toMatch(/no existe/);
  });
});

describe('hash de la firma digital (RF-05)', () => {
  const base = {
    kind: 'NOTE',
    entityId: 'n-1',
    content: { subjective: 'dolor', plan: 'endodoncia' },
    signerId: 'u-1',
    signedAt: new Date('2026-11-02T15:00:00.000Z'),
  };

  it('es un SHA-256 hexadecimal determinista', () => {
    const hash = signatureHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(signatureHash({ ...base })).toBe(hash);
  });

  it('no depende del orden de las claves del contenido', () => {
    const swapped = { ...base, content: { plan: 'endodoncia', subjective: 'dolor' } };
    expect(signatureHash(swapped)).toBe(signatureHash(base));
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('cualquier cambio de contenido, firmante, documento o fecha altera el hash', () => {
    const hash = signatureHash(base);
    expect(signatureHash({ ...base, content: { subjective: 'dolor!', plan: 'endodoncia' } })).not.toBe(hash);
    expect(signatureHash({ ...base, signerId: 'u-2' })).not.toBe(hash);
    expect(signatureHash({ ...base, entityId: 'n-2' })).not.toBe(hash);
    expect(signatureHash({ ...base, signedAt: new Date('2026-11-02T15:00:00.001Z') })).not.toBe(hash);
  });

  it('verifica la integridad', () => {
    const hash = signatureHash(base);
    expect(verifySignatureHash(hash, base)).toBe(true);
    expect(verifySignatureHash(hash, { ...base, content: { x: 1 } })).toBe(false);
    expect(verifySignatureHash(null, base)).toBe(false);
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('plazo de bloqueo de las notas (RF-05)', () => {
  const created = new Date('2026-11-02T10:00:00.000Z');

  it('24 horas por defecto, configurable', () => {
    expect(computeLockAt(created, 24).toISOString()).toBe('2026-11-03T10:00:00.000Z');
    expect(computeLockAt(created, 48).toISOString()).toBe('2026-11-04T10:00:00.000Z');
    expect(computeLockAt(created, 0).getTime()).toBe(created.getTime());
  });

  it('la nota se bloquea exactamente al cumplirse el plazo', () => {
    const note = { lockAt: computeLockAt(created, 24) };
    expect(isNoteLocked(note, new Date('2026-11-03T09:59:59.999Z'))).toBe(false);
    expect(isNoteLocked(note, new Date('2026-11-03T10:00:00.000Z'))).toBe(true);
    expect(isNoteLocked(note, new Date('2026-11-10T00:00:00.000Z'))).toBe(true);
  });
});

describe('alergias vs. fármacos de una receta', () => {
  const amoxicillin = { name: 'Amoxicilina 500 mg', activeIngredient: 'Amoxicilina', allergyGroups: ['penicilina', 'betalactámico'] };
  const ibuprofen = { name: 'Ibuprofeno 400 mg', activeIngredient: 'Ibuprofeno', allergyGroups: ['aines'] };

  it('detecta la alergia por familia, ingrediente o nombre, sin acentos ni mayúsculas', () => {
    expect(findAllergyConflicts([amoxicillin], ['Penicilina'])).toEqual([
      { drug: 'Amoxicilina 500 mg', allergy: 'Penicilina', matchedTerm: 'penicilina' },
    ]);
    expect(findAllergyConflicts([amoxicillin], ['AMOXICILINA'])).toHaveLength(1);
    expect(findAllergyConflicts([amoxicillin], ['betalactamicos'])).toHaveLength(1);
    expect(findAllergyConflicts([ibuprofen], ['AINEs'])).toHaveLength(1);
  });

  it('sin coincidencia no hay alerta', () => {
    expect(findAllergyConflicts([ibuprofen], ['Penicilina', 'Látex'])).toEqual([]);
    expect(findAllergyConflicts([amoxicillin], [])).toEqual([]);
  });

  it('también cubre fármacos escritos a mano (sin catálogo)', () => {
    expect(findAllergyConflicts([{ name: 'Penicilina G' }], ['penicilina'])).toHaveLength(1);
  });

  it('ignora términos demasiado cortos para evitar falsos positivos', () => {
    expect(findAllergyConflicts([{ name: 'Gel' }], ['gel'])).toEqual([]);
  });
});

describe('validación de adjuntos (tipo real, tamaño y contenido)', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

  it('detecta el tipo por los primeros bytes', () => {
    expect(detectContentType(png)).toBe('image/png');
    expect(detectContentType(jpeg)).toBe('image/jpeg');
    expect(detectContentType(webp)).toBe('image/webp');
    expect(detectContentType(pdf)).toBe('application/pdf');
    expect(detectContentType(Buffer.from('MZ ejecutable'))).toBeNull();
  });

  it('acepta archivos válidos y deduce el tipo de adjunto', () => {
    expect(validateUpload('rx.png', png)).toEqual({ ok: true, value: { contentType: 'image/png', kind: AttachmentKind.PHOTO } });
    expect(validateUpload('rx.JPG', jpeg, AttachmentKind.XRAY)).toMatchObject({ ok: true, value: { kind: AttachmentKind.XRAY } });
    expect(validateUpload('informe.pdf', pdf)).toMatchObject({ ok: true, value: { kind: AttachmentKind.DOCUMENT } });
  });

  it('rechaza extensión que no corresponde al contenido', () => {
    expect(validateUpload('virus.pdf', png)).toMatchObject({ ok: false, error: expect.stringMatching(/extensión/) });
    expect(validateUpload('foto.png', Buffer.from('MZ-programa'))).toMatchObject({ ok: false });
  });

  it('rechaza vacíos, demasiado grandes y PDF como radiografía', () => {
    expect(validateUpload('a.png', Buffer.alloc(0))).toMatchObject({ ok: false });
    expect(validateUpload('a.png', Buffer.concat([png, Buffer.alloc(MAX_ATTACHMENT_BYTES)]))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/15 MB/),
    });
    expect(validateUpload('a.pdf', pdf, AttachmentKind.XRAY)).toMatchObject({ ok: false });
  });

  it('bloquea la firma de prueba EICAR y los PDF con contenido activo', () => {
    const eicar = Buffer.concat([png, Buffer.from(EICAR_TEST_STRING)]);
    expect(validateUpload('a.png', eicar)).toMatchObject({ ok: false, error: expect.stringMatching(/seguridad/) });
    const active = Buffer.from('%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>');
    expect(validateUpload('a.pdf', active)).toMatchObject({ ok: false, error: expect.stringMatching(/activo/) });
  });
});
