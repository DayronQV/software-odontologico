import { Controller, Get, INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnyRole, Public, Roles } from '../src/common/decorators';
import { bearer, createSession, createTestApp, http, TestSession } from './helpers';

@Controller('test-rbac')
class RbacProbeController {
  /** Sin @Roles/@Public/@AnyRole: debe DENEGARSE (menor privilegio). */
  @Get('sin-roles')
  sinRoles() {
    return 'no debería verse';
  }

  @Public()
  @Get('publico')
  publico() {
    return { ok: true };
  }

  @AnyRole()
  @Get('cualquiera')
  cualquiera() {
    return { ok: true };
  }

  @Roles(Role.AUDITOR)
  @Get('solo-auditor')
  soloAuditor() {
    return { ok: true };
  }
}

const ALL_ROLES = [
  Role.ADMIN_TI,
  Role.RECEPCIONISTA,
  Role.ODONTOLOGO,
  Role.ASISTENTE,
  Role.AUDITOR,
] as const;

describe('RBAC con menor privilegio (RNF-05a)', () => {
  let app: INestApplication;
  const sessions = {} as Record<Role, TestSession>;

  beforeAll(async () => {
    app = await createTestApp([RbacProbeController]);
    for (const role of ALL_ROLES) sessions[role] = await createSession(app, role);
  });
  afterAll(() => app.close());

  const status = (role: Role, path: string) =>
    http(app)
      .get(path)
      .set(bearer(sessions[role].accessToken))
      .then((r) => r.status);

  const matrix: Array<[string, Role[]]> = [
    ['/api/users', [Role.ADMIN_TI]],
    ['/api/audit', [Role.ADMIN_TI, Role.AUDITOR]],
    ['/api/audit/verify', [Role.ADMIN_TI, Role.AUDITOR]],
    ['/api/files/download-url?key=uploads/x/y.pdf', [Role.ADMIN_TI, Role.ODONTOLOGO, Role.ASISTENTE]],
    ['/api/test-rbac/solo-auditor', [Role.AUDITOR]],
    ['/api/test-rbac/cualquiera', [...ALL_ROLES]],
  ];

  it.each(matrix)('%s: permitido solo a los roles declarados', async (path, allowed) => {
    for (const role of ALL_ROLES) {
      const expected = allowed.includes(role) ? 200 : 403;
      expect({ role, status: await status(role, path) }).toEqual({ role, status: expected });
    }
  });

  it('un endpoint sin roles declarados se DENIEGA a todos, incluso al administrador', async () => {
    for (const role of ALL_ROLES) {
      expect(await status(role, '/api/test-rbac/sin-roles')).toBe(403);
    }
  });

  it('los endpoints públicos no piden token; los demás exigen autenticación', async () => {
    await http(app).get('/api/test-rbac/publico').expect(200);
    await http(app).get('/api/health').expect(200);
    for (const path of ['/api/users', '/api/audit', '/api/test-rbac/cualquiera', '/api/test-rbac/sin-roles']) {
      await http(app).get(path).expect(401);
    }
  });
});
