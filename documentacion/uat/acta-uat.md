# Acta de aceptación de usuario (UAT) — SIGO-Dental v1.0.0

| | |
|---|---|
| **Proyecto** | SIGO-Dental — Sistema Integral de Gestión Odontológica y Expediente Clínico Digital |
| **Versión probada** | v1.0.0 |
| **Documento base** | SRS v1.0 (29/10/2026) |
| **Fecha de la ejecución automatizada** | 30/10/2026 (ver `resultados-uat.md`) |
| **Entorno** | Docker Compose, gateway TLS 1.3, datos semilla de prueba |

## 1. Resultado

| Concepto | Resultado |
|---|---|
| Casos UAT ejecutados | 45 |
| Casos aprobados | **45 (100 %)** |
| Defectos abiertos Alta/Crítica | 0 |
| Suites automáticas backend | 57 suites, 602 pruebas, cobertura 94,1 % sentencias / 95,5 % líneas (críticos ≥ 95 %) |
| Suites automáticas frontend | 26 archivos, 207 pruebas |
| Seguridad | SAST (Semgrep), dependencias, secretos (gitleaks, historial completo), contenedores (Trivy): sin hallazgos Altos/Críticos abiertos |
| Carga | 150 usuarios concurrentes: ver `informe-carga.md` |
| Navegadores | Chromium, Firefox y WebKit; 1920×1080, 1366×768 y tabletas ≥ 10,5": ver `matriz-navegadores.md` |

## 2. Aceptación por perfil

Cada responsable repasa su sección del *Manual de usuario* en el sistema, marca la casilla y firma.

| Perfil | Flujos revisados | Observaciones | Aceptado | Nombre y firma | Fecha |
|---|---|---|---|---|---|
| Recepcionista | Pacientes (menor/tutor), agenda, sala de espera, POS, caja ciega | | ☐ | | |
| Odontólogo | Odontograma, periodontograma, SOEP, consentimiento, recetas, plan/presupuesto | | ☐ | | |
| Asistente dental | Signos vitales, notas, inventario | | ☐ | | |
| Auditor / Contador | Reportes, caja, comisiones, inventario, auditoría | | ☐ | | |
| Administrador TI | Usuarios, catálogos, auditoría, telemetría, respaldos | | ☐ | | |

## 3. Observaciones y compromisos

- Las integraciones de WhatsApp/SMS, facturación fiscal y pasarela de pagos operan con **adaptadores simulados** (proyecto de costo cero); el correo es real por SMTP.
- La firma digital del profesional se implementa con **reautenticación (contraseña) + huella SHA-256** del contenido y la marca de tiempo.
- En Render el TLS lo gestiona el proveedor; el rechazo de TLS 1.2 está verificado en el despliegue con Nginx (`docker-compose.prod.yml`).

## 4. Aprobación

El cliente/docente declara que el sistema cumple los requisitos acordados para la versión 1.0.0.

| Rol | Nombre | Firma | Fecha |
|---|---|---|---|
| Representante del cliente / docente | | | |
| Responsable del desarrollo (DayronQV) | | | |
