# Cobertura de pruebas (SRS §8.2)

Generado con `npm run test:cov` (backend: 57 suites unitarias + e2e contra PostgreSQL, Redis y MinIO reales) el 30/10/2026.
Los umbrales están en `backend/jest.config.js` y **rompen el pipeline** si se incumplen (global: sentencias/funciones/líneas ≥ 80 %, ramas ≥ 70 %; módulos críticos: auth, audit, crypto, billing, clinical, patients, agenda ≥ 80–90 %).

## Backend por módulo

| Módulo | Sentencias | Líneas | Funciones | Ramas |
|---|---|---|---|---|
| agenda | 97.0 % | 98.1 % | 100.0 % | 84.9 % |
| audit | 99.1 % | 100.0 % | 100.0 % | 88.6 % |
| auth | 96.8 % | 99.2 % | 100.0 % | 80.4 % |
| backup | 55.6 % | 55.3 % | 58.7 % | 42.0 % |
| billing | 95.8 % | 96.6 % | 100.0 % | 78.6 % |
| catalog | 99.3 % | 99.2 % | 100.0 % | 80.9 % |
| clinical | 95.4 % | 96.6 % | 92.3 % | 76.5 % |
| commissions | 94.9 % | 98.4 % | 98.4 % | 76.7 % |
| common | 98.1 % | 98.9 % | 97.8 % | 75.3 % |
| config | 100.0 % | 100.0 % | 100.0 % | 100.0 % |
| crypto | 100.0 % | 100.0 % | 100.0 % | 83.3 % |
| files | 100.0 % | 100.0 % | 100.0 % | 79.3 % |
| health | 86.4 % | 89.5 % | 66.7 % | 66.7 % |
| integrations | 100.0 % | 100.0 % | 100.0 % | 66.7 % |
| inventory | 95.0 % | 97.8 % | 97.6 % | 73.5 % |
| notifications | 93.7 % | 94.8 % | 100.0 % | 70.8 % |
| patients | 97.9 % | 99.0 % | 100.0 % | 84.3 % |
| prisma | 100.0 % | 100.0 % | 100.0 % | 96.7 % |
| queue | 100.0 % | 100.0 % | 100.0 % | 87.5 % |
| realtime | 92.5 % | 97.1 % | 90.0 % | 71.4 % |
| redis | 100.0 % | 100.0 % | 100.0 % | 75.0 % |
| reports | 93.9 % | 98.5 % | 88.0 % | 75.8 % |
| signing | 96.7 % | 98.5 % | 93.1 % | 83.7 % |
| system | 91.5 % | 92.6 % | 92.9 % | 61.0 % |
| treatments | 93.8 % | 95.8 % | 100.0 % | 71.8 % |
| users | 100.0 % | 100.0 % | 100.0 % | 77.4 % |
| **TOTAL** | **94.24 %** | **95.62 %** | **94.85 %** | **77.42 %** |

## Frontend (Vitest + Testing Library)

26 archivos, 207 pruebas. Cobertura global: sentencias 34,5 %, ramas 33,1 %, funciones 28,8 %, líneas 34,4 % (se miden TODOS los archivos de `src/`, incluidas las pantallas con carga diferida). El SRS exige 80 % solo en los endpoints críticos del backend; en el frontend el umbral (30 %) evita regresiones.

## Totales de la corrida final (30/10/2026)

Backend: 57 suites, 602 pruebas, 0 fallos. Sentencias 94,11 %, ramas 77,41 %, funciones 94,54 %, líneas 95,48 %.
