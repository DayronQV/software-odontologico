# Informe de pruebas de carga (RNF-03 y RNF-01)

**Herramienta:** k6 (`loadtest/k6-sigo.js`) · **Fecha:** 30/10/2026
**Entorno:** todo el sistema (Nginx TLS 1.3, backend NestJS ×1, PostgreSQL, Redis, MinIO) en Docker Desktop sobre un portátil con Windows, **y el generador de carga en la misma máquina** (condición desfavorable: compite por CPU con el sistema).

## Escenario

- **150 usuarios virtuales concurrentes**, cada uno un usuario real con MFA activo (151 creados: 40 % recepción, 33 % odontólogos, 17 % asistentes, 6 % auditoría, 4 % administración).
- Subida de 1 min, **meseta de 4 min con 150 usuarios**, bajada de 30 s; pausa de 1–3 s entre acciones (lectura humana).
- Cada rol ejecuta su navegación real: agenda y búsqueda de pacientes (recepción); **expediente completo = ficha + odontograma + anamnesis en paralelo**, notas SOEP, línea de tiempo y planes (odontólogo); signos vitales e inventario (asistente); panel de indicadores y reportes (auditor); telemetría y auditoría (admin).
- Umbrales (la prueba falla si no se cumplen): errores < 1 %, p95 global < 1 500 ms, p95 del expediente < 1 500 ms.

## Resultados

| Métrica | 1.ª corrida (antes) | 2.ª corrida (después de optimizar) | Umbral |
|---|---|---|---|
| Peticiones totales | 39 299 | **66 939** | — |
| Rendimiento | 118 req/s | **202 req/s** | — |
| Errores HTTP | 0,00 % | **0,00 %** | < 1 % |
| Comprobaciones funcionales | 100 % | **100 %** (66 939 / 66 939) | > 99 % |
| Latencia media | 878 ms | **319 ms** | — |
| Latencia p50 / p90 | 905 ms / 1,36 s | **293 ms / 554 ms** | — |
| **Latencia p95** | 1,52 s ✗ | **675 ms** ✔ | < 1 500 ms |
| Latencia p99 | 1,86 s | **1,09 s** | — |
| **Expediente + odontograma p50** | 1,38 s | **315 ms** | — |
| **Expediente + odontograma p95** | 1,97 s ✗ | **705 ms** ✔ | < 1 500 ms (RNF-01) |
| Expediente p99 / máx. | 2,25 s / 2,51 s | 1,14 s / 1,43 s | — |

Salida completa de k6: `documentacion/evidencias/k6-resultado.txt`.

## Diagnóstico y optimización

La primera corrida no cumplió el p95 (1,52 s global y 1,97 s en el expediente), aunque sin ningún error. La causa fue la
**auditoría inmutable (RNF-06)**: cada lectura de una entidad clínica escribe un registro encadenado por hash, y cada
escritura tomaba por separado un bloqueo asesor de PostgreSQL (bloqueo + lectura del último hash + inserción = 3 viajes
bajo el bloqueo), de modo que bajo carga las peticiones hacían cola.

**Corrección:** *group commit* en `AuditService` (`backend/src/audit/audit.service.ts`): las escrituras simultáneas se agrupan
y un único bloqueo y una sola transacción encadenan todo el lote en orden (hasta 200 registros por lote). Se conserva la
garantía de integridad: la petición **espera a que su registro esté confirmado** y falla si no se pudo auditar; la cadena de
hashes sigue siendo válida (verificada por `audit.e2e-spec.ts`, UAT-074 y las pruebas de concurrencia).
Resultado: +71 % de rendimiento y latencia p95 de 1,52 s a 0,68 s.

## Conclusiones

- **RNF-03:** el sistema sostiene 150 usuarios concurrentes durante 4 min sin errores (0 de 66 939 peticiones).
- **RNF-01:** el expediente con odontograma carga en p95 = 705 ms (< 1,5 s) incluso con 150 usuarios, con el generador de carga compartiendo CPU. Con un solo usuario la mediana es ≈ 116 ms (`clinical-access.e2e-spec.ts`).
- Margen: una sola instancia del backend; si se requiere más holgura se escala horizontalmente (la sesión está en Redis y la cadena de auditoría se serializa en PostgreSQL, por lo que es segura con varias instancias).
- Los límites de frecuencia (login 5/min, API 600/min por IP) se elevaron solo para esta prueba porque todos los usuarios virtuales comparten una IP (`THROTTLE_AUTH_LIMIT`, `THROTTLE_LIMIT`); en producción cada usuario tiene su propia IP.

## Reproducir

Ver `loadtest/README.md`.
