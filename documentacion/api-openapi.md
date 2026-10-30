# Documentación técnica de la API (OpenAPI / Swagger v3.0)

- **Especificación:** [`backend/openapi.json`](../backend/openapi.json), OpenAPI 3.0, versión 1.0.0 (se regenera con `WRITE_OPENAPI=1 npx jest --config jest.config.js --selectProjects e2e --runInBand test/openapi` en `backend/`).
- **Interfaz interactiva (Swagger UI):** `https://localhost/api/docs` en desarrollo. En producción está apagada por defecto (`SWAGGER_ENABLED=false`).
- **Contenido:** 172 operaciones en 140 rutas, agrupadas por módulo. Cada operación incluye resumen, identificador único, parámetros y esquemas, roles autorizados (`x-roles`), autenticación Bearer JWT y respuestas de error 400/401/403/429/500 con el esquema `ErrorResponse`.
- **Validación:** Spectral (`npx @stoplight/spectral-cli lint backend/openapi.json`): 0 errores y 0 advertencias; además la prueba `backend/test/openapi.e2e-spec.ts` verifica que todas las operaciones estén completas.
