# Matriz de trazabilidad: requisito → implementación → evidencia

SRS v1.0 (29/10/2026). «UAT» = `documentacion/uat/resultados-uat.md`; las pruebas se ejecutan con `npm run test:e2e` (backend) y `npm test` (frontend).

## Requisitos funcionales

| Req. | Implementación | Evidencia |
|---|---|---|
| RF-01 Ficha única del paciente (demográficos, emergencia, tutor si menor, seguro) | `backend/src/patients`, `frontend/src/features/patients` | `patients.e2e-spec.ts`; UAT-010…013 |
| RF-02 Anamnesis obligatoria + insignia de condición crítica | `patients/medical-history`, reglas de alerta configurables | `patients.e2e-spec.ts`, `catalog.e2e-spec.ts`; UAT-012 |
| RF-03 Odontograma 2D (32+20 dientes, FDI/Universal, 5 superficies, catálogo visual) | `clinical/odontogram`, SVG propio en `frontend/.../odontogram` | `clinical-odontogram.e2e-spec.ts`; UAT-030; Playwright (capturas 05–06) |
| RF-04 Periodontograma (6 puntos, margen, NIC, furca, movilidad, sangrado) | `clinical/perio` | `clinical-perio-vitals.e2e-spec.ts`; capturas 07 |
| RF-05 Notas SOEP inmutables, bloqueo 24 h, firma digital | `clinical/notes` (adendas, SHA-256) | `clinical-notes-rn01.e2e-spec.ts`; UAT-033 |
| RF-06 Consentimiento por procedimiento (táctil/OTP) | `signing`, `clinical/consents` | `clinical-consents.e2e-spec.ts`; UAT-034/035; captura 10 |
| RF-07 Presupuestos por fases/sesiones con descuentos autorizados | `treatments` | `treatments.e2e-spec.ts`; UAT-050/051 |
| RF-08 Aprobación total/parcial → tareas agendables | `treatments` (aprobaciones firmadas) | `treatments.e2e-spec.ts`; UAT-052 |
| RF-09 Agenda día/semana por consultorio/sillón y profesional | `agenda`, FullCalendar | `agenda.e2e-spec.ts`; UAT-020; captura 01 |
| RF-10 Estados de cita | máquina de estados en `agenda/domain` | `agenda.e2e-spec.ts`; UAT-022/023/060 |
| RF-11 Confirmación y recordatorios 48 h/24 h | `notifications` (BullMQ, WhatsApp/SMS simulados, correo real) | `notifications.e2e-spec.ts`; UAT-024 |
| RF-12 POS y facturación con pagos mixtos | `billing` (factura fiscal y pasarela simulados) | `billing*.e2e-spec.ts`; UAT-061/062 |
| RF-13 Comisiones (% fijo, monto fijo, % tras laboratorio/materiales) | `commissions` | `commissions.e2e-spec.ts`; UAT-070 |
| RF-14 Descargo automático de insumos | `inventory` (receta de consumo, transaccional) | `inventory.e2e-spec.ts`; UAT-036/037 |

## Requisitos no funcionales

| Req. | Implementación | Evidencia |
|---|---|---|
| RNF-01 Expediente + odontograma < 1,5 s | Consultas indexadas, carga diferida | `clinical-access.e2e-spec.ts` (mediana ≈ 116 ms); `informe-carga.md` (k6) |
| RNF-02 Disponibilidad 99,9 % 07:00–21:00 | Healthchecks, reinicio, orden de arranque, respaldos, alertas | `operacion-y-disponibilidad.md`; `docker-compose.prod.yml` |
| RNF-03 150 usuarios concurrentes | Prueba de carga k6 | `informe-carga.md` |
| RNF-04 TLS 1.3 + AES-256 en reposo | Nginx `TLSv1.3`; AES-256-GCM en campos; SSE-S3; respaldos cifrados | `informe-seguridad.md` §4 |
| RNF-05 RBAC, MFA obligatorio, cierre a 15 min | Guards globales, TOTP, sesión deslizante | `rbac`, `auth`, `session-idle` e2e; UAT-001, 080…085 |
| RNF-06 Auditoría inmutable | Triggers + cadena de hashes | `audit.e2e-spec.ts`; UAT-074/075 |
| RNF-07 Responsive 1920×1080, 1366×768, tablet ≥ 10,5" | Tailwind responsive, SVG táctil | `matriz-navegadores.md` |
| RNF-08 Últimas 2 versiones de Chrome, Firefox, Edge, Safari | Sin APIs no estándar | `matriz-navegadores.md` |

## Reglas de negocio y aceptación

| Req. | Implementación | Evidencia |
|---|---|---|
| RN-01 Lo «Realizado» nunca se borra (adenda firmada) | Sin rutas de borrado + triggers | `clinical-notes-rn01.e2e-spec.ts`; UAT-036 |
| RN-02 Cierre de caja ciego | La vista de la cajera omite totales teóricos | `billing.e2e-spec.ts`; UAT-063/064 |
| RN-03 Sin citas simultáneas en el mismo sillón | Restricciones de exclusión de PostgreSQL | `agenda.e2e-spec.ts` (carrera concurrente); UAT-021 |
| §8.2 Cobertura ≥ 80 % en endpoints críticos | Umbrales por módulo en `jest.config.js` + CI | `documentacion/evidencias/cobertura.md` |
| §8.2 SAST/DAST sin Alta/Crítica (OWASP) | Semgrep, ZAP, Trivy, npm audit, gitleaks | `informe-seguridad.md` |
| §8.2 OpenAPI/Swagger 3.0 | `backend/openapi.json` (Spectral sin errores ni avisos) | `openapi.e2e-spec.ts` |

## Implícitos del SRS

Recetas con control de alergias (`clinical/prescriptions`), catálogo médico (procedimientos, precios, receta de consumo),
inventario por consultorio y profesional, reportes BI exportables, corte de caja, liquidación de honorarios, signos vitales,
adjuntos (Rx, fotos, PDF), respaldos (Admin), telemetría/auditoría y retenciones fiscales (tipo de retención en el comprobante).
