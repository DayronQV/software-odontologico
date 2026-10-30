# Informe de seguridad — SIGO-Dental v1.0.0

**Fecha:** 30/10/2026 · **Alcance:** repositorio completo (backend NestJS, frontend React, Dockerfiles, Compose, Nginx, historial de Git) y sistema desplegado en Docker (https://localhost).
**Criterio de aceptación (SRS §8.2):** SAST/DAST sin vulnerabilidades Alta/Crítica según OWASP Top 10.

## 1. Resumen ejecutivo

| Control | Herramienta | Resultado final |
|---|---|---|
| SAST | Semgrep (`p/owasp-top-ten`, `p/typescript`, `p/nodejs`, `p/secrets`; 155 reglas, 505 archivos) | 9 hallazgos iniciales (2 ERROR, 7 WARNING) → **0 abiertos** |
| Dependencias | `npm audit` (backend y frontend) | Producción: 8 + 1 vulnerabilidades (6 altas) → **0**. Desarrollo: 5 (2 críticas de `tinypool`) → **0** en frontend; backend 9 *low* solo de herramientas de desarrollo |
| Secretos | gitleaks sobre **todo el historial** (5 commits) y el árbol | 10 coincidencias, todas valores de desarrollo públicos o referencias a variables → permitidas con justificación en `.gitleaks.toml`; **0 secretos reales** |
| Contenedores/IaC | Trivy (vulnerabilidades + malas configuraciones, severidad Alta/Crítica) | 2 hallazgos (contenedores nginx como *root*) → **0 abiertos** |
| DAST | OWASP ZAP 2.x: *baseline* (SPA + gateway TLS) y *API scan* autenticado (odontólogo, 172 operaciones del contrato OpenAPI, ataque activo: inyección SQL/XSS/comandos/XXE/SSTI/path traversal…) | **0 FAIL** (alto/crítico): baseline 63 reglas OK, API 119 reglas OK. Avisos: ver sección 2b |
| Revisión manual OWASP Top 10 | 16 pruebas automáticas + revisión de código | **Sin hallazgos abiertos** (sección 3) |

**Veredicto:** no hay vulnerabilidades Altas ni Críticas abiertas.

## 2. Hallazgos y correcciones

| # | Origen | Hallazgo | Severidad | Corrección |
|---|---|---|---|---|
| 1 | Semgrep `gcm-no-tag-length` | AES-GCM sin longitud de etiqueta fija en `crypto.service.ts` y en el nuevo módulo de respaldos: un atacante podría truncar la etiqueta de autenticación | Alta | `authTagLength: 16` en cifrado y descifrado |
| 2 | Semgrep `request-host-used` ×6 | `$host` de la petición usado en redirecciones/proxy de Nginx (inyección de cabecera Host) | Media | La redirección HTTP→HTTPS valida el host con una expresión regular; el proxy fija `Host` al del *upstream* (`$proxy_host`) |
| 3 | Semgrep `possible-nginx-h2c-smuggling` | `Upgrade: $http_upgrade` reenviado sin filtrar | Media | Solo se acepta `websocket` (`map $http_upgrade`); otro valor cierra la conexión |
| 4 | `npm audit` | `multer` (DoS), `@nestjs/platform-express`, `js-yaml` (CPU), `deepmerge-ts` (prisma), `zod` <4.6.6 (memoria) | Alta | `npm audit fix` + `overrides` (multer ≥ 2.5, js-yaml ≥ 5.5, deepmerge-ts ≥ 8) + migración a zod 4 y `@hookform/resolvers` 5; 0 vulnerabilidades en producción |
| 5 | `npm audit` (dev) | `tinypool` (RCE por contaminación de prototipo) vía vitest 2 | Crítica (solo desarrollo) | vitest 5; 0 vulnerabilidades en el frontend |
| 6 | Trivy DS-0002 | Los contenedores nginx del frontend y del gateway de Render corrían como *root* | Alta | `nginx-unprivileged` (usuario sin privilegios, puerto 8080 / `$PORT`) |
| 7 | Playwright (prueba de navegador) | El CSP bloqueaba la fuente embebida de FullCalendar (`data:`): iconos de la agenda rotos bajo HTTPS | Media (funcional) | `font-src 'self' data:` en el CSP |
| 8 | Revisión de configuración | Tamaño máximo de petición (10 MB) menor que el de adjuntos (15 MB) | Baja | `client_max_body_size 16m` |
| 9 | Revisión de configuración | CSP sin `object-src`, `base-uri`, `form-action`; sin Permissions-Policy | Baja | `object-src 'none'; base-uri 'self'; form-action 'self'` y `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| 10 | Revisión de configuración | Swagger público en producción | Media | `SWAGGER_ENABLED` apagado por defecto en producción |
| 11 | Revisión de configuración | Secretos de desarrollo aceptables en producción | Alta | El backend se niega a arrancar con `JWT_ACCESS_SECRET`/`ENCRYPTION_KEY`/clave S3 de desarrollo; SMTP exige TLS |

Falsos positivos de gitleaks (10): `JWT_ACCESS_SECRET` y `ENCRYPTION_KEY` de **desarrollo** en `.env.example`/`app-config.ts`
(el backend los rechaza en producción), clave de pruebas en `test-env.ts` y la expresión `secretAccessKey: env.S3_SECRET_KEY`.

## 2b. Resultado de OWASP ZAP (DAST)

Informes completos: `documentacion/evidencias/zap/baseline.html` y `api.html` (+ JSON).

| Aviso de ZAP | Riesgo | Tratamiento |
|---|---|---|
| HSTS con varias cabeceras (backend + Nginx) | Bajo | **Corregido**: `proxy_hide_header Strict-Transport-Security` en `/api` y `/ws` (una sola cabecera) |
| COOP / CORP ausentes | Bajo | **Corregido**: `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy: same-origin` |
| CSP: `wss:` (se detecta como comodín) | Medio | Aceptado: necesario para WebSocket seguro al mismo origen en todos los navegadores; solo permite el esquema `wss:` (nunca HTTP) |
| CSP: `style-src 'unsafe-inline'` | Medio | Aceptado: FullCalendar y los estilos dinámicos del SVG usan estilos en línea; `script-src 'self'` sí es estricto (sin `unsafe-inline` ni `unsafe-eval`) |
| COEP ausente, caché, «contenido inesperado» | Informativo/Bajo | Sin impacto: la API responde JSON con `no-store`; la SPA usa `no-store` en `index.html` |

## 3. Revisión manual OWASP Top 10 (2021)

| Categoría | Verificación | Evidencia |
|---|---|---|
| **A01 Control de acceso roto** | RBAC global que **deniega por defecto** (`@Roles`/`@AnyRole`/`@Public`); IDOR: recursos de un paciente no accesibles por la ruta de otro (adjuntos, hallazgos, periodontogramas, notas), notas solo editables/firmables por su autor, recepción/admin/auditor sin acceso clínico | `security-owasp.e2e-spec.ts`, `rbac.e2e-spec.ts`, `clinical-access.e2e-spec.ts`, UAT-080…085 |
| **A02 Fallos criptográficos** | TLS 1.3 solamente (TLS 1.2 → alerta *protocol version*; suite `TLS_AES_256_GCM_SHA384`); AES-256-GCM en campos sensibles, índice ciego HMAC, respaldos AES-256-GCM, contraseñas Argon2id, firma SHA-256 | Prueba `openssl s_client`; `users-crypto.e2e-spec.ts`; `backup.spec.ts` |
| **A03 Inyección** | Prisma parametrizado (sin SQL concatenado); `ValidationPipe` con `whitelist` + `forbidNonWhitelisted`; cargas SQL/`UNION` tratadas como texto; CSV con neutralización de fórmulas; adjuntos validados por contenido (firma de archivo, EICAR) | `security-owasp.e2e-spec.ts`, `reports.e2e-spec.ts`, `clinical-attachments.e2e-spec.ts` |
| **A04 Diseño inseguro** | Reglas de negocio en BD (exclusión de solapes RN-03, triggers de inmutabilidad RN-01/RNF-06, `TRUNCATE` bloqueado); cierre de caja ciego | Suites de dominio |
| **A05 Configuración incorrecta** | Helmet + CSP + HSTS + `nosniff` + `X-Frame-Options: DENY`; CORS por lista blanca; sin `X-Powered-By`; Swagger apagado en producción; errores sin trazas; contenedores de aplicación sin *root* | `security-owasp.e2e-spec.ts`; Trivy |
| **A06 Componentes vulnerables** | `npm audit` 0 en producción; Trivy; CI bloquea Alta/Crítica | Sección 1 |
| **A07 Fallos de autenticación** | MFA TOTP obligatorio para todos los roles (anti-repetición, códigos de recuperación de un solo uso); JWT de 10 min + refresh rotativo con detección de reutilización; sesión inactiva 15 min; límite de 5 intentos/min en login y MFA; mensaje de error idéntico para usuario inexistente y clave errónea; política de contraseña 12+ | `auth.e2e-spec.ts`, `session-idle.e2e-spec.ts`, `rate-limit.e2e-spec.ts` |
| **A08 Integridad de software y datos** | Cadena de hashes de auditoría verificable (`/audit/verify`); firma de notas con SHA-256 y verificación; respaldos con SHA-256 + GCM; `npm ci` con *lockfile*; CI sin `latest` | `audit.e2e-spec.ts`, UAT-033/074 |
| **A09 Registro y monitoreo** | Auditoría inmutable (quién, qué, ISO-8601, IP) de CRUD/exportaciones clínicas; ingresos fallidos registrados; telemetría y alertas de disponibilidad | UAT-074/075, `system.e2e-spec.ts`, `scripts/monitor.sh` |
| **A10 SSRF** | El backend no realiza peticiones a URLs suministradas por el usuario; los únicos destinos salientes (SMTP, S3) vienen de variables de entorno; las URLs firmadas de S3 se generan en servidor con caducidad de 60 s | Revisión de código |

## 4. Verificación de RNF-04 / RNF-05 / RNF-06 y protección de datos

| Requisito | Verificación | Resultado |
|---|---|---|
| RNF-04 TLS 1.3 | `openssl s_client -tls1_2` → `alert protocol version`; `-tls1_3` → `TLSv1.3 / TLS_AES_256_GCM_SHA384` | ✔ (Nginx autoalojado). En Render el TLS lo gestiona el proveedor |
| RNF-04 AES-256 en reposo | Campos sensibles (`User.documentId`, `MfaSecret.secret`) cifrados con AES-256-GCM (verificado en PostgreSQL); MinIO con SSE-S3; respaldos cifrados | ✔ |
| RNF-05 RBAC/MFA | 5 roles, menor privilegio, MFA obligatorio | ✔ 45/45 UAT |
| RNF-05 cierre a 15 min | Expiración deslizante en Redis (servidor) + aviso a los 14 min (navegador) | ✔ `session-idle.e2e-spec.ts` |
| RNF-06 auditoría inmutable | Triggers SQL rechazan `UPDATE`/`DELETE`/`TRUNCATE`; cadena de hashes válida; manipulación detectada | ✔ `audit.e2e-spec.ts` |
| Datos en tránsito/logs | Interceptor de auditoría redacta claves sensibles; logs sin contraseñas ni tokens | ✔ |
| Minimización | Adjuntos accesibles solo por URLs de 60 s o por el backend con permisos; recepción sin acceso clínico | ✔ |

## 5. Riesgos aceptados

| Riesgo | Justificación |
|---|---|
| 9 avisos *low* en `npm audit` (backend, solo dependencias de desarrollo: Jest/Nest CLI) | No se empaquetan ni se ejecutan en producción |
| TLS gestionado por Render permite TLS 1.2 | Limitación del proveedor; el despliegue autoalojado exige TLS 1.3 |
| Semgrep re-ejecutado tras las correcciones: **0 ERROR**; 13 avisos *WARNING*: 10 por acciones de GitHub fijadas por etiqueta (`@v4`) en lugar de SHA (solo acciones oficiales de GitHub) y 3 de Nginx (`$host`/`Upgrade`) ya mitigados con validación del host y lista blanca `websocket`, que la regla no reconoce | Sin impacto explotable; fijar SHA es un endurecimiento opcional |
| Integraciones simuladas (fiscal, WhatsApp/SMS, pagos) | Decisión de costo cero; el contrato está aislado tras interfaces |
