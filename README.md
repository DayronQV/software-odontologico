# SIGO-Dental

Sistema Integral de Gestión Odontológica y Expediente Clínico Digital — proyecto académico (Framework, 7.º semestre).

Implementa el *Documento de Requerimientos de Software (SRS v1.0)*: pacientes, agenda, odontograma, periodontograma, notas SOEP, consentimientos, presupuestos, facturación, inventario y auditoría, con seguridad de nivel clínico (TLS 1.3, AES-256, MFA, RBAC, log inmutable).

> **Estado:** Fases 0 (fundación y seguridad) y 1 (core administrativo y turnos: pacientes, anamnesis, agenda, recordatorios, POS y caja ciega) completadas. Ver [`CLAUDE.md`](CLAUDE.md) para el contexto completo y el avance por fases.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS 4 · React Hook Form + Zod |
| Backend | NestJS 11 (monolito modular) · Prisma 6 · PostgreSQL 16 |
| Tiempo real | WebSockets (Socket.IO) autenticados con JWT — WSS detrás de Nginx |
| Cola / caché | Redis 7 · BullMQ |
| Archivos | MinIO (API compatible con S3), cifrado SSE-S3 |
| Gateway | Nginx (TLS 1.3 · HSTS · proxy a API/WSS/web) |
| Calidad | Jest + Supertest (backend) · Vitest + Testing Library (frontend) · Swagger/OpenAPI 3.0 |

## Arranque rápido (todo en Docker)

Requisitos: Docker Desktop.

```bash
docker compose up -d --build
```

Abre **https://localhost** (el certificado es de desarrollo y autofirmado: el navegador mostrará una advertencia; acéptala).

| Servicio | URL |
|---|---|
| Aplicación web | https://localhost |
| API + Swagger (OpenAPI 3.0) | https://localhost/api/docs |
| Health check | https://localhost/api/health |
| Correo de prueba (Mailpit) | http://localhost:8025 |
| Consola de MinIO | http://localhost:9001 (`sigo_minio` / `sigo_minio_dev_password`) |

### Usuarios de desarrollo (uno por rol)

Contraseña de todos: `Sigo-Dev-2026!` (ver `.env.example`).

| Correo | Rol |
|---|---|
| admin@sigo.test | Administrador TI |
| recepcion@sigo.test | Recepcionista / Cajero |
| odontologo@sigo.test | Odontólogo |
| especialista@sigo.test | Odontólogo (segundo profesional) |
| asistente@sigo.test | Asistente Dental |
| auditor@sigo.test | Auditor / Contador |

**Primer ingreso:** el MFA es obligatorio. Tras la contraseña, escanea el QR con Google Authenticator / Microsoft Authenticator / Authy, escribe el primer código y guarda los 8 códigos de recuperación.

## Desarrollo local (sin reconstruir imágenes)

```bash
# 1) Infraestructura en Docker
docker compose up -d postgres redis minio minio-init mailpit

# 2) Backend  (puerto 3000)
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run seed
npm run start:dev

# 3) Frontend (puerto 5173, proxy a /api y /ws)
cd frontend
npm install
npm run dev
```

> PostgreSQL de Docker se publica en el puerto **5433** (no 5432) para no chocar con un Postgres local.

## Fase 1 en breve

- **Pacientes y anamnesis** con alertas críticas, **agenda** día/semana por consultorio/sillón/profesional (sin solapamientos), **recordatorios** 48 h/24 h (Email real a Mailpit en http://localhost:8025; WhatsApp/SMS simulados), **POS** con pagos mixtos y comprobante electrónico simulado, **caja ciega** y administración de catálogos.
- Usuarios de prueba (clave `Sigo-Dev-2026!`): `admin`, `recepcion`, `odontologo`, `especialista`, `asistente`, `auditor` @sigo.test. Todos deben activar MFA al primer ingreso.
- Pacientes demo: Carlos Mendoza (alergia a penicilina, anticoagulado), Sofía Ramírez (menor de edad), Ana Torres (sin anamnesis).

## Pruebas

```bash
cd backend
npm test            # unitarias
npm run test:e2e    # integración contra Postgres/Redis/MinIO reales (requiere la infraestructura de Docker)
npm run test:cov    # todo + cobertura (umbral 80 %)

cd frontend
npm test
```

Las pruebas e2e usan la base `sigo_test` y Redis DB 1; nunca tocan los datos de desarrollo.

## Seguridad (Fase 0)

| Requisito | Implementación |
|---|---|
| RNF-04a TLS 1.3 | Nginx con `ssl_protocols TLSv1.3` + HSTS; HTTP redirige a HTTPS |
| RNF-04b AES-256 en reposo | Campos sensibles cifrados con AES-256-GCM a nivel de aplicación (extensión de Prisma); MinIO con SSE-S3; ver nota de producción abajo |
| RNF-05a RBAC | Guard global que **deniega por defecto**: cada endpoint declara `@Roles`, `@AnyRole` o `@Public` |
| RNF-05b MFA | TOTP (RFC 6238) obligatorio para todos los roles; códigos de recuperación de un solo uso; anti-replay |
| RNF-05c Sesión | Expira a los 15 min de inactividad en servidor (Redis, expiración deslizante) y en el navegador (aviso a los 14 min) |
| RNF-06 Auditoría | Tabla de solo inserción: trigger SQL rechaza `UPDATE`/`DELETE`/`TRUNCATE` + cadena de hashes SHA-256 verificable en `GET /api/audit/verify` |
| Fuerza bruta | Rate limiting en login y MFA; Argon2id para contraseñas; rotación de refresh tokens con detección de reutilización |

**Producción — cifrado en reposo de PostgreSQL:** el motor no cifra los archivos de datos por sí solo. En producción el volumen de la base debe estar cifrado (LUKS/dm-crypt, EBS/Azure Disk con cifrado, o el cifrado del servicio gestionado). Las claves (`ENCRYPTION_KEY`, `JWT_ACCESS_SECRET`, clave KMS de MinIO) deben salir de un gestor de secretos y rotarse; el backend se niega a arrancar en `production` con los valores de desarrollo.

## Estructura

```
backend/    NestJS: auth, users, audit, files, queue, realtime, health (+ prisma/)
frontend/   React: features/, components/, lib/
docker/     Nginx (gateway) y SQL de inicialización
docker-compose.yml
```

## Integraciones simuladas

Proyecto educativo de **costo cero**: facturación fiscal, WhatsApp/SMS y pasarela de pagos se implementan tras interfaces con adaptadores simulados (fases siguientes). El correo es real contra Mailpit.
