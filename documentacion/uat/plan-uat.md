# Plan de pruebas de aceptación de usuario (UAT)

**Sistema:** SIGO-Dental v1.0.0 · **Base:** SRS v1.0 (29/10/2026) · **Entorno:** Docker Compose con TLS 1.3 (https://localhost) o el despliegue de Render.

## 1. Objetivo y alcance

Demostrar que el sistema cumple los requisitos funcionales (RF-01…RF-14), las reglas de negocio (RN-01…RN-03) y los
requisitos no funcionales verificables en pruebas (RNF-01, 04, 05, 06, 07, 08) con usuarios de **cada rol**, siguiendo el flujo
real de una clínica: *paciente menor de edad → anamnesis → cita → atención clínica → presupuesto y aprobación → cobro →
caja → comisiones → reportes → auditoría*, más los casos negativos de seguridad.

Fuera de alcance (SRS): aplicación móvil nativa, DICOM/3D/PACS. Integraciones de WhatsApp/SMS, facturación fiscal y pasarela
de pagos se prueban contra sus **adaptadores simulados** (costo cero).

## 2. Participantes

| Rol de prueba | Usuario | Responsabilidad en el UAT |
|---|---|---|
| Recepcionista | `recepcion@sigo.test` | Pacientes, agenda, sala de espera, cobro, caja |
| Odontólogo | `odontologo@sigo.test` | Odontograma, SOEP, consentimientos, recetas, plan y presupuesto |
| Asistente | `asistente@sigo.test` | Signos vitales, inventario, límites de acceso |
| Auditor/Contador | `auditor@sigo.test` | Reportes, comisiones, caja, inventario |
| Administrador TI | `admin@sigo.test` | Configuración, auditoría, telemetría, respaldos |

(Usuarios de **prueba**; clave `Sigo-Dev-2026!`; MFA obligatorio desde el primer ingreso. No existen en producción.)

## 3. Estrategia

1. **Automatizada y repetible** — `uat/uat-e2e.js` ejecuta contra el sistema desplegado los 45 casos de la sección 4 con los 5
   roles, y escribe `documentacion/uat/resultados-uat.md` (bitácora de resultados con fecha). Complementa las suites automáticas
   (backend: 57 suites / 602 pruebas, 16 de ellas de seguridad OWASP; frontend: 26 archivos / 207 pruebas).
2. **Guiada por rol** — el personal sigue el *Manual de usuario* y marca la columna «Aceptado por el usuario» del acta.
3. **Navegadores y dispositivos** — matriz Playwright (`documentacion/evidencias/matriz-navegadores.md`).
4. **Carga y seguridad** — `informe-carga.md` e `informe-seguridad.md`.

Criterio de aceptación: **100 % de los casos críticos aprobados**, ningún defecto abierto de severidad Alta/Crítica, y acta firmada.

## 4. Casos de prueba (resumen; detalle y resultados en `resultados-uat.md`)

| Bloque | Casos | Requisitos |
|---|---|---|
| 0 Acceso y seguridad | UAT-001/002 | RNF-05 (MFA, autenticación) |
| 1 Recepción: menor, tutor, anamnesis | UAT-010…013 | RF-01, RF-02 |
| 2 Agenda y sala de espera | UAT-020…024 | RF-09, RF-10, RF-11, RN-03 |
| 3 Expediente clínico | UAT-030…040 | RF-03, RF-05, RF-06, RF-14, RN-01, adjuntos |
| 4 Plan y presupuesto | UAT-050…052 | RF-07, RF-08 |
| 5 Atención, cobro y caja ciega | UAT-060…066 | RF-12, RN-02 |
| 6 Comisiones, reportes, auditoría | UAT-070…076 | RF-13, reportes BI, RNF-06 |
| 7 Negativos por rol | UAT-080…085 | RNF-05 (menor privilegio, fuerza bruta) |

## 5. Casos negativos adicionales (suites automáticas)

IDOR entre pacientes, inyección SQL, asignación masiva, tokens manipulados/`alg:none`, CORS, fuga de información en errores,
registro de ingresos fallidos (`backend/test/security-owasp.e2e-spec.ts`); inmutabilidad de la auditoría y de lo realizado
por SQL directo (`audit.e2e-spec.ts`, `clinical-*.e2e-spec.ts`); sesión inactiva de 15 min (`session-idle.e2e-spec.ts`);
doble reserva concurrente (`agenda.e2e-spec.ts`); límite de frecuencia (`rate-limit.e2e-spec.ts`).

## 6. Procedimiento de ejecución

```bash
docker compose down -v && docker compose up -d --build     # sistema nuevo con datos semilla
node uat/uat-e2e.js                                        # genera documentacion/uat/resultados-uat.md
```
Después, el responsable de cada rol repasa su sección del manual en el navegador y registra observaciones en el acta.

## 7. Gestión de defectos

| Severidad | Definición | Plazo |
|---|---|---|
| Crítica/Alta | Impide un flujo del SRS o expone datos | Corregir antes de la aceptación |
| Media | Flujo posible con rodeo | Corregir o aceptar con plan |
| Baja | Cosmético | Backlog |
