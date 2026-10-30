import { AuditHashInput, canonicalize, computeAuditHash, GENESIS_HASH } from './audit-hash';

const base: AuditHashInput = {
  timestamp: '2026-10-29T12:00:00.000Z',
  userId: 'u1',
  role: 'ADMIN_TI',
  action: 'READ',
  entity: 'Patient',
  entityId: 'p1',
  ip: '10.0.0.1',
  userAgent: 'jest',
  before: null,
  after: { b: 2, a: 1 },
};

describe('audit-hash', () => {
  it('canonicalize ordena las claves recursivamente', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    );
    expect(canonicalize(undefined)).toBe('null');
    expect(canonicalize('texto')).toBe('"texto"');
  });

  it('el hash es determinista e independiente del orden de las claves', () => {
    const swapped = { ...base, after: { a: 1, b: 2 } };
    expect(computeAuditHash(GENESIS_HASH, base)).toBe(computeAuditHash(GENESIS_HASH, swapped));
    expect(computeAuditHash(GENESIS_HASH, base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cualquier cambio en el contenido o en el hash previo cambia el hash', () => {
    const original = computeAuditHash(GENESIS_HASH, base);
    expect(computeAuditHash(GENESIS_HASH, { ...base, action: 'UPDATE' })).not.toBe(original);
    expect(computeAuditHash(GENESIS_HASH, { ...base, ip: '10.0.0.2' })).not.toBe(original);
    expect(computeAuditHash('f'.repeat(64), base)).not.toBe(original);
  });

  it('trata undefined y null como equivalentes', () => {
    expect(computeAuditHash(GENESIS_HASH, { ...base, before: undefined })).toBe(
      computeAuditHash(GENESIS_HASH, { ...base, before: null }),
    );
  });
});
