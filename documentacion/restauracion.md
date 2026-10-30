# Respaldos y restauración

## Qué se respalda

| Dato | Método | Cifrado | Retención |
|---|---|---|---|
| PostgreSQL (todo el esquema, incluidos triggers y datos) | `pg_dump` formato *custom*, cifrado en cliente **AES-256-GCM** con una clave derivada (HKDF) de `ENCRYPTION_KEY`; huella SHA-256 en el manifiesto | Sí (más SSE-S3 del bucket) | `BACKUP_RETENTION_DAYS` (30 por defecto); el último respaldo nunca se borra |
| Documentos clínicos (MinIO/S3: adjuntos, firmas, consentimientos) | Espejo **incremental** al bucket de respaldos (los documentos son inmutables, RN-01, así que solo se copian los nuevos) | SSE-S3 del bucket | Permanente (nunca se borran) |

El respaldo corre solo, a diario a las 02:00 (`BACKUP_HOUR`, zona `America/Bogota`), en el servicio `backup`
(autoalojado) o en el cron `sigo-backup` (Render). Para máxima seguridad use **un bucket de otro proveedor**
(`BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`): así un fallo del servidor no se lleva también los respaldos.
Solo el **administrador de TI** ve el listado (*Administración → Sistema y respaldos*, `GET /api/system/backups`) y quien
tiene acceso al servidor puede ejecutar o restaurar.

## Comandos

```bash
# Autoalojado (compose de producción; en desarrollo agregue --profile backup y use docker-compose.yml)
docker compose -f docker-compose.prod.yml run --rm backup backup          # respaldar ahora
docker compose -f docker-compose.prod.yml run --rm backup list            # listar
docker compose -f docker-compose.prod.yml run --rm backup prune           # aplicar la retención
docker compose -f docker-compose.prod.yml run --rm backup restore <id> <DATABASE_URL> [--files]
```

## Procedimiento de restauración (verificado)

**Siempre restaure primero en una base de prueba** para comprobar el respaldo sin tocar producción:

1. Elija el respaldo: `… run --rm backup list` (ej.: `20261030T065754Z`).
2. Cree una base vacía: `docker compose exec postgres psql -U sigo -d postgres -c "CREATE DATABASE sigo_restore_test"`.
3. Restaure: `… run --rm backup restore 20261030T065754Z postgresql://sigo:<clave>@postgres:5432/sigo_restore_test`.
   Se verifica la huella SHA-256 y la etiqueta GCM antes de restaurar: un archivo alterado o una clave equivocada **abortan**.
4. Compare conteos con producción (usuarios, pacientes, auditoría, procedimientos) y valide la cadena de auditoría
   (`GET /api/audit/verify`) apuntando una instancia de la API a esa base.
5. **Recuperación real** (desastre): detenga el backend (`docker compose stop backend`), restaure sobre la base de producción
   con la misma orden (`--clean --if-exists` reemplaza los objetos), añada `--files` si el almacenamiento de documentos también se perdió, y
   levante de nuevo (`docker compose up -d backend`). Requiere la **misma `ENCRYPTION_KEY`** que cifró los datos.

### Resultado de la prueba de restauración (30/10/2026)

Respaldo `20261030T065754Z` (212 642 bytes cifrados) restaurado en `sigo_restore_test`:
usuarios 6 = 6, pacientes 3 = 3, procedimientos 13 = 13, auditoría 0 = 0; los triggers de inmutabilidad
(`evolution_note_update_guard`, auditoría) estaban presentes en la copia restaurada. Pruebas unitarias
(`backend/src/backup/backup.spec.ts`) cubren: ida y vuelta del cifrado, detección de un byte alterado, clave incorrecta,
archivo ajeno/truncado y la retención.

## Pérdida de la clave `ENCRYPTION_KEY`

Sin esa clave no se pueden descifrar ni los campos cifrados de la base ni los respaldos. Guárdela en un gestor de
contraseñas **separado del servidor** y en una copia impresa en custodia. No se rota sin un procedimiento de re-cifrado.
