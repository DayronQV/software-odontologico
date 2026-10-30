import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/auth/password.service';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

export const STRONG_PASSWORD = 'Contrasena-Segura-2026!';

export async function createTestApp(extraControllers: Type<unknown>[] = []): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export const http = (app: INestApplication) => request(app.getHttpServer());

/** Código TOTP para un secreto base32; `steps` desplaza la ventana de 30 s. */
export function totpCode(secret: string, steps = 0): string {
  return new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp: Date.now() + steps * 30_000 });
}

export async function createUser(app: INestApplication, role: Role, password = STRONG_PASSWORD) {
  const prisma = app.get(PrismaService);
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.sigo`;
  const user = await prisma.db.user.create({
    data: {
      email,
      fullName: `Usuario ${role}`,
      role,
      passwordHash: await app.get(PasswordService).hash(password),
    },
  });
  return { id: user.id, email, password };
}

export async function login(app: INestApplication, email: string, password: string) {
  return http(app).post('/api/auth/login').send({ email, password });
}

export interface TestSession {
  user: { id: string; email: string; password: string };
  accessToken: string;
  refreshToken: string;
  /** Secreto TOTP en base32 */
  secret: string;
  recoveryCodes: string[];
}

/** Crea un usuario, inicia sesión y completa el enrolamiento MFA (sesión con MFA verificado). */
export async function createSession(app: INestApplication, role: Role): Promise<TestSession> {
  const user = await createUser(app, role);
  const partial = (await login(app, user.email, user.password)).body;
  const setup = await http(app)
    .post('/api/auth/mfa/setup')
    .set('Authorization', `Bearer ${partial.accessToken}`)
    .expect(200);
  const enabled = await http(app)
    .post('/api/auth/mfa/enable')
    .set('Authorization', `Bearer ${partial.accessToken}`)
    .send({ code: totpCode(setup.body.secret) })
    .expect(200);
  return {
    user,
    accessToken: enabled.body.accessToken,
    refreshToken: enabled.body.refreshToken,
    secret: setup.body.secret,
    recoveryCodes: enabled.body.recoveryCodes,
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
