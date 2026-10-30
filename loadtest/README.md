# Prueba de carga (k6)

Simula **150 usuarios concurrentes** (RNF-03) con la mezcla de roles de una clínica (40 % recepción, 33 % odontólogos,
17 % asistentes, 6 % auditoría, 4 % administración), cada uno con MFA real, y mide la carga del expediente + odontograma
(RNF-01 < 1,5 s).

```bash
# 1) Sistema nuevo con límites de frecuencia elevados (un solo generador de carga comparte IP; en producción cada IP tiene 600 req/min)
docker compose down -v
THROTTLE_AUTH_LIMIT=1000 THROTTLE_LIMIT=100000 ACCESS_TOKEN_TTL_SECONDS=900 docker compose up -d --build --wait
# 2) Crea los 150 usuarios con MFA y guarda sus tokens (loadtest/users.json, no se versiona)
node loadtest/prepare-users.js
# 3) Ejecuta k6 (5,5 min: subida 1 min, meseta 4 min, bajada 30 s)
docker run --rm -v "$PWD/loadtest:/loadtest" -e BASE_URL=https://host.docker.internal grafana/k6 run /loadtest/k6-sigo.js
```
Umbrales (la prueba falla si no se cumplen): errores HTTP < 1 %, p95 global < 1 500 ms, p95 del expediente < 1 500 ms.
Variable `QUICK=1` acorta el escenario a 55 s para pruebas rápidas.
