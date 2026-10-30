# CLAUDE.md — SIGO-Dental

Contexto completo del proyecto para trabajar sin releer el SRS. **Lee esto primero.**

## Qué es
SIGO-Dental: Sistema Integral de Gestión Odontológica y Expediente Clínico Digital. Proyecto **educativo** (materia Framework, 7.º semestre) que debe cumplir **exactamente** el SRS v1.0 (29/10/2026), sin omitir nada. Se desarrolla **por fases**: el usuario entrega un MD de fase (`docs/fases/fase-N-*.md`, **local, no versionado**) y se desarrolla solo esa fase.

## Reglas de trabajo (del usuario)
- **Costo cero:** nada de gastar en servicios reales. Facturación fiscal, WhatsApp/SMS y pagos van **simulados tras interfaces** (puerto/adaptador). Firma digital = PIN/contraseña + hash SHA-256; si el docente pide más, certificado **autofirmado** (nunca uno pagado).
- **Sin ramas:** commits directo a `main` y push al repo.
- **El autor de los commits es el usuario** (DayronQV). **No agregar Claude como coautor** ni líneas `Co-Authored-By`.
- **No subir `docs/`** (plan, checklist y MD de fases son locales): no commitearlos ni ponerlos en `.gitignore`. Agregar archivos por ruta, nunca `git add .`.
- Usar **Docker** para la infraestructura y el despliegue.
- Decisiones técnicas abiertas: las toma Claude con criterio y lo informa.
- Idioma de UI, mensajes y comentarios: **español**.

## Stack
React 19 + TS + Vite + Tailwind 4 + RHF/Zod (front) · NestJS 11 monolito modular + Prisma 6 + PostgreSQL 16 (back) · Redis + BullMQ · MinIO (S3) · Nginx (gateway TLS 1.3) · Socket.IO (WS/WSS) · JWT + MFA TOTP · Swagger/OpenAPI 3.0 · Jest/Supertest, Vitest/Testing Library · Docker Compose.
Siguientes fases añaden: FullCalendar (agenda), SVG hecho a mano (odontograma/periodontograma), adaptadores simulados.

## Comandos
```bash
docker compose up -d --build                                   # todo -> https://localhost
docker compose up -d postgres redis minio minio-init mailpit   # solo infraestructura
cd backend && npm run start:dev | test | test:e2e | test:cov | typecheck | lint
cd backend && npx prisma migrate dev --name <x> --create-only   # nueva migración (revisar el SQL)
cd frontend && npm run dev | test | typecheck | lint | build
```
Usuarios semilla (`*@sigo.test`, clave `Sigo-Dev-2026!`): admin, recepcion, odontologo, asistente, auditor. El MFA es obligatorio: primer login → QR → código → códigos de recuperación.

## Trampas conocidas
- **Postgres de Docker en el puerto 5433** (el 5432 lo ocupa un Postgres local). BD de pruebas: `sigo_test`; Redis de pruebas: DB 1.
- **Imagen de MinIO:** Docker Hub/Quay ya no publican `minio/minio`; se usa `bitnamilegacy/minio` y `bitnamilegacy/minio-client`. El bucket se crea con cifrado SSE-S3 vía `minio-init`.
- **Prisma:** usar siempre `prisma.db` (cliente con **cifrado transparente AES-256-GCM** de `User.documentId` y `MfaSecret.secret`). No se puede filtrar por campos cifrados ni descifrar relaciones anidadas. No usar `prisma migrate reset` (Prisma lo bloquea al detectar un agente de IA); los tests reinician el esquema con `DROP SCHEMA`.
- `AuditLog` es de solo inserción (trigger SQL). Para simular manipulación en tests hay que desactivar el trigger temporalmente y restaurar.
- TOTP con anti-replay: en tests usar `totpCode(secret, ±1)` o códigos de recuperación; no reutilizar el mismo paso dos veces.
- Jest usa `tsconfig.jest.json` (CommonJS); el build usa `module: node16`. Los tipos de tests se verifican con `npm run typecheck`.
- El rate limit de auth se lee de `process.env` al **importar** módulos (decoradores); en tests se fija a 1000 salvo en `rate-limit.e2e-spec`.
- **Plugin de Swagger en Windows:** si un DTO tiene una propiedad con tipo de **clase** (ni siquiera del mismo archivo), `nest build` genera `require("C:/…/src/…")` absoluto y el backend no arranca en la máquina del usuario (en Linux/Docker sí funciona). Usar tipos literales/inline en DTOs de respuesta, o comprobar `grep -rl 'require("[A-Za-z]:/' dist` tras compilar.
- Las capturas del navegador integrado fallan a veces y no confía en el certificado autofirmado de `https://localhost`; para revisar la UI usar Vite (`npm run dev`, http://127.0.0.1:5173) con el backend en el host, y medir el layout con JS.
- Windows/git-bash: el cwd puede cambiar entre comandos; usar rutas absolutas.

## Arquitectura (backend `src/`)
`config` (env validado con zod; en producción rechaza secretos de desarrollo) · `crypto` · `prisma` (+extensión de cifrado) · `redis` · `auth` (login, JWT acceso 10 min + refresh rotativo hasheado con detección de reutilización, MFA TOTP, sesión deslizante en Redis, `JwtAuthGuard`+`RolesGuard`) · `users` · `audit` (cadena de hashes, interceptor global por `@AuditEntity`) · `files` (URLs firmadas S3) · `queue` (BullMQ `notifications`) · `realtime` (gateway WS, auth en el handshake, salas `user:`/`role:`) · `health` · `common` (decoradores, filtro de errores, `configureApp`).
Guards globales en orden: Throttler → JwtAuth (JWT + sesión Redis + usuario activo + MFA) → Roles (**deniega por defecto**: todo endpoint debe tener `@Roles`, `@AnyRole` o `@Public`).
Endpoints parciales (sin MFA aún): `@AllowPartialAuth` (mfa setup/enable/verify, logout, me).
Para auditar una entidad clínica: `@AuditEntity('Patient')` en el controlador (acción derivada del método HTTP, o `@AuditAction('EXPORT')`).
Frontend `src/`: `lib` (api con refresh single-flight, auth context con fases, `useSessionActivity` = idle 15 min + keep-alive, schemas, roles/menú) · `components` (AppLayout, ProtectedRoute, ui/*) · `features/*`.

## Roles (SRS §3)
`ADMIN_TI` (config, logs, catálogos, backups, usuarios) · `RECEPCIONISTA` (agenda, pacientes, cobro, facturación) · `ODONTOLOGO` (clínico, odontograma, plan, recetas, evolución) · `ASISTENTE` (signos vitales, insumos, notas clínicas) · `AUDITOR` (corte de caja, honorarios, inventario).

## Requerimientos del SRS (resumen fiel)
**RF-01** ficha única del paciente (demográficos, contacto de emergencia, tutor legal si menor, seguro/convenio). **RF-02** anamnesis obligatoria (enf. sistémicas, alergias a fármacos, antec. quirúrgicos, coagulopatías) + badge de alta visibilidad en cabecera del expediente si hay condición crítica (alergia a penicilina, anticoagulados). **RF-03** odontograma 2D interactivo: 32 permanentes + 20 temporales, FDI y Universal, 5 superficies (mesial, distal, oclusal/incisal, vestibular, lingual/palatino), catálogo visual (caries rojo, restauraciones azul, endodoncia realizada/requerida, implantes, prótesis fija/removible, exodoncias, sellantes). **RF-04** periodontograma: 6 puntos por diente, margen gingival, NIC calculado, furca, movilidad, sangrado. **RF-05** notas SOEP inmutables, bloqueo configurable (24 h por defecto), firma digital del profesional. **RF-06** consentimiento informado por procedimiento: firma en pantalla táctil u OTP. **RF-07** presupuestos por fases/sesiones (honorarios, laboratorio, descuentos autorizados). **RF-08** aprobación total/parcial → ítems aprobados pasan a tareas agendables. **RF-09** agenda día/semana filtrable por consultorio/sillón y profesional. **RF-10** estados de cita: Programado, Confirmado, En Sala de Espera, En Atención, Atendido, Cancelado, No Asistió. **RF-11** confirmación y recordatorios 48 h y 24 h por WhatsApp/SMS/Email. **RF-12** POS y facturación electrónica con pagos mixtos (efectivo, tarjeta, transferencia, seguro). **RF-13** comisiones: % fijo, monto fijo por procedimiento, % tras deducir laboratorio/materiales. **RF-14** descargo automático de insumos al completar un procedimiento según receta de consumo.
**RNF-01** expediente+odontograma < 1.5 s (≥15 Mbps) · **RNF-02** 99.9 % de 07:00 a 21:00 · **RNF-03** 150 usuarios concurrentes · **RNF-04** TLS 1.3 + AES-256 en reposo · **RNF-05** RBAC menor privilegio, MFA obligatorio, logout a 15 min · **RNF-06** log de auditoría inmutable (quién, qué, ISO-8601, IP) de CRUD/exportaciones en historias clínicas · **RNF-07** responsive 1920×1080, 1366×768, tablet ≥10.5" · **RNF-08** últimas 2 versiones de Chrome, Firefox, Edge, Safari.
**RN-01** procedimiento "Realizado" nunca se borra; corrección solo por adenda firmada · **RN-02** cierre de caja ciego (recepcionista no ve el total teórico antes de contar) · **RN-03** no se agendan dos citas simultáneas en el mismo sillón (aunque cambie el odontólogo).
**Aceptación §8.2:** cobertura ≥ 80 % en endpoints críticos, SAST/DAST sin vulnerabilidades Alta/Crítica (OWASP Top 10), OpenAPI/Swagger 3.0. **Fuera de alcance:** app móvil nativa (PWA en fase 2 del SRS), DICOM/3D/PACS.
Implícitos a no olvidar: recetas odontológicas, catálogo médico (procedimientos/precios/receta de consumo), inventario por consultorio y por profesional, reportes BI, corte de caja, liquidación de honorarios, signos vitales, adjuntos (Rx, fotos, PDFs), backups (Admin), módulo de telemetría/auditoría, retenciones fiscales.

## Fases y avance
| Fase | Contenido | Estado |
|---|---|---|
| 0 | Fundación: Docker, NestJS, React, JWT, RBAC, MFA, sesión 15 min, auditoría inmutable, AES-256, TLS 1.3, files, colas, WSS, seed, tests | ✅ **Completada** |
| 1 | Pacientes (RF-01/02), agenda (RF-09/10, RN-03), recordatorios (RF-11), POS/facturación simulada (RF-12), caja ciega (RN-02), catálogo médico, usuarios/catálogos Admin | ✅ **Completada** |
| 2 | Odontograma, periodontograma, SOEP+firma, consentimientos, recetas, presupuestos, adjuntos (RF-03…08, RN-01) | ✅ **Completada** |
| 3 | Comisiones (RF-13), descargo de insumos (RF-14), inventario, reportes BI, rol Auditor | ✅ **Completada** |
| 4 | UAT, SAST/DAST, carga 150 usuarios, backups, producción (Render), OpenAPI final | ✅ **Completada** (v1.0.0) |

Resultados Fase 0: backend 100 pruebas (cobertura ≈ 98 % líneas), frontend 60 pruebas (cobertura ≈ 54 %; el SRS exige 80 % solo en endpoints críticos del backend), lint y tipos limpios. Verificado en Docker: TLS 1.2 rechazado/TLS 1.3 ok, MFA→RBAC→WSS por el gateway, campos cifrados en Postgres, triggers de auditoría, y UI responsive medida en 1920×1080, 1366×768, iPad 10.5" (horizontal y vertical).

Resultados Fase 1: backend 34 suites / 300 pruebas (≈ 95 % líneas), frontend 17 archivos / 120 pruebas, tipos y lint limpios; E2E vivo por Docker (33/33 comprobaciones).

Resultados Fase 2: backend 47 suites / 484 pruebas (≈ 93 % sentencias, 94 % líneas), frontend 24 archivos / 198 pruebas, tipos y lint limpios; verificación en vivo por Docker 30/30 y expediente + odontograma en ≈ 50 ms (RNF-01: < 1,5 s).

Resultados Fase 3: backend 53 suites / 563 pruebas (≈ 92 % sentencias, 94 % líneas), frontend 25 archivos / 204 pruebas, tipos y lint limpios; verificación en vivo por Docker; reportes con ~30 000 filas en < 150 ms.

### Arquitectura Fase 3
- Backend: `inventory/` (ubicaciones por consultorio/profesional, stock = suma del kardex inmutable, alertas, recetas, `ConsumptionService` llamado desde `ProcedureRecordsService` DENTRO de su transacción, preparación de insumos, conteos) · `commissions/` (calculador puro, reglas, devengo/reversión desde `InvoiceIssuingService`/`InvoiceVoidService`, liquidaciones + PDF) · `reports/` (registro de reportes `ReportDefinition`, exportación CSV/PDF, panel con caché Redis 60 s).
- Integridad SQL (migración `phase3_finanzas_inventario`): `StockMovement` y `CommissionEntry` inmutables, índice único parcial que hace idempotente el descargo, liquidaciones aprobadas/pagadas no se borran, `TRUNCATE` bloqueado.
- Permisos: inventario ADMIN_TI/ASISTENTE/AUDITOR (escribe ADMIN_TI y ASISTENTE; concilia AUDITOR); comisiones y reportes ADMIN_TI/AUDITOR, el ODONTOLOGO solo lo propio (`scopeProfessional`); recepción nada. Anular facturas pagadas en efectivo exige caja abierta de quien anula.
- Trampas: (1) las exportaciones se auditan con `@AuditAction('EXPORT')`; (2) el BOM del CSV se escribe como `﻿` (un literal invisible rompe eslint); (3) en tests, `npx` a veces devuelve 127 en la primera llamada de un comando compuesto: repetir; (4) el límite de login (5/min) afecta a los scripts de verificación en vivo.

### Arquitectura Fase 2
- Backend: `clinical/` (domain: tooth-notation FDI↔Universal, finding-catalog, perio-calculations, signature SHA-256, note-lock, allergy-check, attachment-validator · odontogram · perio · notes (SOEP, adendas, signos vitales) · procedures (RN-01) · consents · prescriptions · attachments · timeline · shared) · `signing/` (firma del paciente táctil/OTP, reutilizada por consentimientos y aprobación de presupuestos mediante `SigningHandler`) · `treatments/` (planes, presupuestos, aprobación parcial, tareas agendables) · `files/blob-storage.service.ts` (MinIO).
- Integridad en PostgreSQL (migración `phase2_core_clinico`): hallazgos del odontograma solo se cierran, notas bloqueadas tras `lockAt`, adendas/signos vitales/adjuntos/recetas inmutables, `ProcedureRecord` sin UPDATE ni DELETE, ítems realizados protegidos, periodograma finalizado congelado, `TRUNCATE` bloqueado en tablas clínicas, CHECK de códigos FDI.
- Roles: todo el contenido clínico es solo de ODONTOLOGO (escribe) y ASISTENTE (lee, vitales y notas propias); recepción solo ve `schedulable-items`; ADMIN_TI mantiene plantillas, medicamentos y autoriza descuentos altos.
- Texto clínico cifrado AES-256-GCM (`EvolutionNote`, `ClinicalAddendum`, notas de hallazgos/procedimientos/signos, receta, texto del consentimiento).
- Frontend: `features/clinical/{odontogram,perio,notes,procedures,consents,signing,prescriptions,attachments,timeline,attention,shared}` y `features/treatments`; pestañas clínicas cargadas bajo demanda (lazy).
- Trampas: (1) `Modal` guarda `onClose` en una ref: si fuera dependencia del efecto, el foco volvía al diálogo con cada tecla; (2) `AgendaPage` solo actualiza el rango si cambió (FullCalendar avisa en cada render → bucle); (3) `api()` acepta `formData` para subidas y `ApiError.details` para datos estructurados (alertas de alergia); (4) `TRUNCATE` no dispara triggers por fila: hay triggers `BEFORE TRUNCATE`; (5) un periodontograma finalizado no admite inserts: crear el examen y finalizar después.

### Arquitectura Fase 1
- Backend (`src/`): `catalog` (consultorios, sillones, profesionales+horarios, procedimientos, aseguradoras, parámetros, reglas de alerta) · `patients` (ficha, tutor, emergencia, seguro, anamnesis, alertas críticas) · `agenda` (citas, máquina de estados RF-10, disponibilidad) · `notifications` (recordatorios 48/24 h con BullMQ, plantillas, historial) · `billing` (POS en centavos, comprobantes, notas de crédito, caja ciega RN-02) · `integrations` (`FiscalInvoiceProvider`, `PaymentGateway`, `MessagingChannel`: WhatsApp/SMS simulados, Email real a Mailpit) · `common` (paginación, dinero, hora local `America/Bogota`, errores Prisma).
- RN-03 se garantiza con restricciones de exclusión de PostgreSQL (`btree_gist`, `tstzrange`) para sillón, profesional y paciente, además de mensajes claros en `AvailabilityService`.
- Búsqueda exacta por documento cifrado: índice ciego HMAC (`CryptoService.blindIndex`, `Patient.documentHash`).
- Frontend: `components/layout`, `components/ui`, `features/{admin,patients,agenda,billing,catalog,...}`; Agenda (FullCalendar) con carga diferida; hooks `useResource`, `usePagedList`, `useDebouncedValue`.
- Seed: 6 usuarios (incl. `especialista@sigo.test`), 13 procedimientos, 3 pacientes demo.
- Trampas: (1) el plugin CLI de Swagger genera `require("C:/…")` en Windows para propiedades tipadas con clases → usar `@ApiProperty({ type: () => X })`; (2) en Vitest, `beforeEach(() => mock.mockReset())` devuelve el mock y se ejecuta como limpieza → usar llaves; (3) `prisma migrate reset` está bloqueado → las e2e hacen `DROP SCHEMA` en `globalSetup`.

### Arquitectura Fase 4 (producción)
- **Despliegue:** `render.yaml` (Blueprint: gateway nginx-unprivileged + backend + Postgres + Key Value + cron de respaldos; S3 externo R2/B2; SMTP real) y `docker-compose.prod.yml` (autoalojado: healthchecks, `depends_on: service_healthy`, `restart: unless-stopped`, logs rotados, red interna, nginx TLS 1.3 con `./certs`). Variables en `.env.production.example`. Arranque de producción: `BOOTSTRAP_PRODUCTION=true` ejecuta `dist/seed-production.js` (admin inicial desde `INITIAL_ADMIN_*` + catálogos base; nunca usuarios `@sigo.test`). `SWAGGER_ENABLED` apagado por defecto en producción; en producción se rechazan secretos y clave S3 de desarrollo.
- **Respaldos** (`backend/src/backup`, imagen `backend/Dockerfile.backup` sobre `postgres:16-alpine`): `pg_dump -Fc` cifrado AES-256-GCM (clave HKDF de `ENCRYPTION_KEY`) + espejo incremental de documentos + manifiestos con SHA-256 + retención; comandos `backup|list|prune|restore|daemon`. Dev: `docker compose --profile backup run --rm backup backup`.
- **Telemetría:** `GET /api/system/status` y `/api/system/backups` (solo `ADMIN_TI`); página *Administración → Sistema y respaldos*.
- **OpenAPI:** `common/openapi-enrichment.ts` completa resumen, roles (`x-roles`, vía `@Roles`), errores y esquema `ErrorResponse`; `backend/openapi.json` se regenera con `WRITE_OPENAPI=1 npx jest ... test/openapi` y se valida con Spectral.
- **Calidad/seguridad:** `.github/workflows/ci.yml` (umbrales de cobertura por módulo en `backend/jest.config.js`, gitleaks con `.gitleaks.toml`, Semgrep, Trivy, `npm audit`, ZAP). Documentación entregable (versionada) en `documentacion/`; `docs/` sigue siendo local.
- **Pruebas vivas:** `uat/uat-e2e.js` (45 casos), `loadtest/` (k6), `e2e/` (Playwright, 9 perfiles de navegador/dispositivo). Todos requieren un sistema recién levantado (`docker compose down -v && up -d`) porque activan el MFA de los usuarios semilla.
- Trampas: (1) el CSP de nginx necesita `font-src 'self' data:` (FullCalendar incrusta su fuente) y `img-src ... blob:`/`frame-src blob:` (visor de adjuntos/PDF); (2) los contenedores nginx del frontend/gateway Render usan `nginx-unprivileged` (puerto 8080/`$PORT`); (3) en Playwright el refresh token rota: inyectarlo solo en la primera carga; (4) dependencias: `overrides` en `backend/package.json` (multer, js-yaml de swagger, deepmerge-ts) corrigen avisos de `npm audit`; zod 4 + `@hookform/resolvers` 5.

## Convenciones
- TypeScript estricto; ESLint + Prettier (comillas simples, 100 cols). Commits en español, estilo `feat(fase-N): …`, `fix: …`.
- Cada endpoint nuevo: DTO validado, `@Roles` explícito, Swagger, auditoría si es clínico/financiero y prueba de caso permitido + denegado.
- Integraciones externas siempre tras una interfaz con adaptador simulado.
- Marcar el avance en `docs/01-requirements-checklist.md` (local) al cerrar cada fase.
