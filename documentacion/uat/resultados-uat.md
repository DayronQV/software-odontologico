# Resultados de la ejecución UAT

- **Fecha de ejecución:** 2026-10-30T08:50:28.428Z
- **Entorno:** https://localhost (Docker Compose, TLS 1.3)
- **Script:** `uat/uat-e2e.js` (reproducible)
- **Resultado:** **45 / 45 casos aprobados** ✅

## 0. Acceso y seguridad

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-001 | Todos | Ingreso con contraseña + MFA TOTP obligatorio (5 perfiles) | Cada perfil obtiene un token completo tras activar el MFA | ✔ Aprobado |
| UAT-002 | Todos | Sin autenticación no se accede a la API | 401 | ✔ Aprobado |

## 1. Recepción: paciente menor de edad y anamnesis (RF-01, RF-02)

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-010 | Recepcionista | Un menor NO se registra sin tutor legal | 400 con mensaje de tutor legal | ✔ Aprobado |
| UAT-011 | Recepcionista | Alta del menor con tutor legal, contacto de emergencia y seguro | 201 con ficha única (isMinor) | ✔ Aprobado |
| UAT-012 | Recepcionista | La anamnesis con alergia a la penicilina genera una alerta crítica visible | Alerta crítica en la ficha | ✔ Aprobado |
| UAT-013 | Recepcionista | Búsqueda por documento cifrado (índice ciego) y por nombre | Encuentra al paciente | ✔ Aprobado |

## 2. Agenda y sala de espera (RF-09, RF-10, RN-03)

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-020 | Recepcionista | Agendar la cita en un sillón | 201 estado Programado | ✔ Aprobado |
| UAT-021 | Recepcionista | RN-03: no se agenda otra cita simultánea en el mismo sillón | 409 | ✔ Aprobado |
| UAT-022 | Recepcionista | Confirmar y registrar llegada (sala de espera) | Estados Confirmado → En sala de espera | ✔ Aprobado |
| UAT-023 | Odontólogo | Pasar la cita a «En atención» | Estado En atención | ✔ Aprobado |
| UAT-024 | Recepcionista | Los recordatorios 48 h/24 h quedaron programados (RF-11) | Historial de notificaciones de la cita | ✔ Aprobado — 3 recordatorios |

## 3. Odontólogo: expediente clínico (RF-03, RF-04, RF-05, RF-06, RN-01)

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-030 | Odontólogo | Registrar caries en el odontograma 2D (diente 36, oclusal) | 201 hallazgo guardado | ✔ Aprobado |
| UAT-031 | Asistente | El asistente NO modifica el odontograma | 403 | ✔ Aprobado |
| UAT-032 | Recepcionista | Recepción NO accede al contenido clínico | 403 | ✔ Aprobado |
| UAT-033 | Odontólogo | Nota de evolución SOEP firmada con contraseña (hash SHA-256) | Nota firmada y verificable | ✔ Aprobado |
| UAT-034 | Odontólogo | Procedimiento con consentimiento obligatorio se bloquea sin firma | 409 | ✔ Aprobado |
| UAT-035 | Odontólogo | Consentimiento informado firmado en pantalla táctil por el tutor y PDF almacenado | Firma TOUCH y PDF | ✔ Aprobado |
| UAT-036 | Odontólogo | Registrar el procedimiento realizado (restauración 36, con consentimiento firmado) y RN-01: no se puede borrar | 201 y DELETE inexistente (404) | ✔ Aprobado |
| UAT-037 | Asistente | RF-14: el procedimiento descontó insumos según la receta de consumo | Existencias menores que antes | ✔ Aprobado — antes 2780.7 → después 2777.1 |
| UAT-038 | Odontólogo | Receta con fármaco al que el paciente es alérgico | 409 con la alergia detectada | ✔ Aprobado |
| UAT-039 | Odontólogo | Receta segura (ibuprofeno) y PDF | 201 y PDF | ✔ Aprobado |
| UAT-040 | Odontólogo | Adjuntar una radiografía; un ejecutable disfrazado se rechaza | 201 / 400 | ✔ Aprobado |

## 4. Plan de tratamiento y presupuesto (RF-07, RF-08)

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-050 | Odontólogo | Crear plan por fases con dos procedimientos y presupuesto con descuento | Presupuesto abierto | ✔ Aprobado |
| UAT-051 | Odontólogo | Un descuento alto exige autorización y el odontólogo no se la da a sí mismo | 403 al autoaprobar; el administrador sí autoriza | ✔ Aprobado |
| UAT-052 | Odontólogo | Aprobación parcial firmada: solo un ítem pasa a tarea agendable | 1 ítem agendable | ✔ Aprobado |

## 5. Atención finalizada, cobro y caja ciega (RF-12, RN-02)

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-060 | Odontólogo | Finalizar la atención | Estado Atendido | ✔ Aprobado |
| UAT-061 | Recepcionista | No se cobra sin caja abierta | 409 | ✔ Aprobado |
| UAT-062 | Recepcionista | Abrir caja y cobrar con pagos mixtos (efectivo + tarjeta) → comprobante autorizado (simulado) | 201, total cuadra, autorizado | ✔ Aprobado |
| UAT-063 | Recepcionista | RN-02: la vista de caja de la cajera NO incluye totales teóricos | Sin expectedCash ni totales por método | ✔ Aprobado |
| UAT-064 | Recepcionista | Cierre ciego: cuenta el efectivo y recién entonces ve el esperado y la diferencia | Cierre con diferencia calculada | ✔ Aprobado |
| UAT-065 | Odontólogo | El odontólogo NO cobra ni abre caja | 403 | ✔ Aprobado |
| UAT-066 | Auditor | El auditor consulta comprobantes y cortes de caja (solo lectura) | 200 | ✔ Aprobado |

## 6. Comisiones, reportes y auditoría (RF-13, §6, RNF-06)

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-070 | Auditor | La emisión del comprobante generó la comisión del profesional | Entradas de comisión | ✔ Aprobado |
| UAT-071 | Auditor | Panel de indicadores y reporte de ingresos | 200 con KPIs | ✔ Aprobado |
| UAT-072 | Auditor | Exportar un reporte a CSV (queda auditado) | CSV con BOM | ✔ Aprobado |
| UAT-073 | Odontólogo | El odontólogo NO ve reportes financieros de la clínica | 403 | ✔ Aprobado |
| UAT-074 | Administrador | La cadena de hashes de la auditoría es íntegra | valid = true | ✔ Aprobado |
| UAT-075 | Administrador | Las lecturas/exportaciones clínicas quedaron registradas (quién, qué, IP) | Eventos de auditoría | ✔ Aprobado |
| UAT-076 | Administrador | Telemetría del sistema: servicios en línea | Estado ok | ✔ Aprobado |

## 7. Casos negativos de seguridad por rol (RNF-05)

| ID | Rol | Caso | Resultado esperado | Estado |
|---|---|---|---|---|
| UAT-080 | Administrador | El administrador de TI NO accede a datos clínicos de pacientes | 403 | ✔ Aprobado |
| UAT-081 | Auditor | El auditor NO accede a pacientes | 403 | ✔ Aprobado |
| UAT-082 | Asistente | El asistente NO anula comprobantes ni gestiona usuarios | 403 | ✔ Aprobado |
| UAT-083 | Recepcionista | Recepción NO ve telemetría ni auditoría | 403 | ✔ Aprobado |
| UAT-084 | Todos | Un token manipulado es rechazado | 401 | ✔ Aprobado |
| UAT-085 | Todos | Cinco ingresos fallidos seguidos activan el limitador de frecuencia | 429 | ✔ Aprobado |
