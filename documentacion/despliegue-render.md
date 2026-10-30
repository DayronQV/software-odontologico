# Despliegue en Render

SIGO-Dental se publica en [Render](https://render.com) con el *Blueprint* `render.yaml` de la raíz del repositorio.
Render termina el TLS con un certificado gestionado (renovación automática, TLS 1.2/1.3 negociado por su balanceador):
la política «solo TLS 1.3» del SRS (RNF-04) se cumple al 100 % en el despliegue autoalojado
(`docker-compose.prod.yml`, nginx con `ssl_protocols TLSv1.3`); en Render el balanceador lo gestiona el proveedor.

## Arquitectura en Render

| Servicio (render.yaml) | Tipo | Función |
|---|---|---|
| `sigo-gateway` | Web (Docker, `docker/render/Dockerfile`) | Único punto público: sirve la SPA, reenvía `/api` y `/ws` (WSS) al backend por la red privada, cabeceras de seguridad y CSP |
| `sigo-backend` | Web (Docker, `backend/Dockerfile`) | API NestJS. Aplica migraciones y crea el primer administrador al arrancar |
| `sigo-db` | PostgreSQL 16 gestionado | Datos clínicos (campos sensibles cifrados con AES-256-GCM por la aplicación) |
| `sigo-redis` | Key Value (Redis) gestionado | Sesión deslizante de 15 min, colas de recordatorios (BullMQ) |
| `sigo-backup` | Cron (Docker, `backend/Dockerfile.backup`) | Respaldo diario cifrado de PostgreSQL + espejo de documentos |
| Almacenamiento S3 | **Externo** | Render no ofrece objetos: Cloudflare R2 o Backblaze B2 (capa gratuita, cifrado en reposo) |

> Planes: el Blueprint usa `free` para la base, Redis, backend y gateway (costo cero para la demostración académica).
> Los planes gratuitos **se duermen tras 15 min sin tráfico** y la base gratuita **caduca a los 30 días**. Para la
> operación real (disponibilidad 99,9 % de 07:00 a 21:00, RNF-02) suba cada servicio a `starter` o superior. El cron de
> respaldos no tiene plan gratuito en Render (`starter`); si no se desea, ejecute el respaldo desde su equipo
> (ver `restauracion.md`) o con el workflow programado de GitHub.

## Paso a paso

1. **Almacenamiento S3 gratuito** (Cloudflare R2, 10 GB): cree dos buckets privados `sigo-files` y `sigo-backups`, y un
   token de API con permisos de lectura/escritura. Anote el *endpoint* (`https://<cuenta>.r2.cloudflarestorage.com`),
   la *Access Key* y la *Secret Key*.
2. **Correo** (recordatorios RF-11): cree una cuenta SMTP gratuita (Brevo, Mailjet o Gmail con contraseña de
   aplicación) y anote host, puerto 587, usuario y clave. WhatsApp/SMS permanecen simulados (costo cero).
3. En Render: **New → Blueprint** → conecte el repositorio `DayronQV/software-odontologico`, rama `main`.
4. Render pide los valores marcados `sync: false`. Complételos:
   - `CORS_ORIGIN`: la URL pública del gateway (`https://sigo-gateway.onrender.com`; se conoce tras crear el servicio: edítela después).
   - `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` (≥ 12 caracteres con mayúscula, minúscula, número y símbolo).
   - `SMTP_*`, `MAIL_FROM`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, y `S3_BUCKET`/`BACKUP_*` del cron.
5. Render genera `JWT_ACCESS_SECRET` y `ENCRYPTION_KEY` (`generateValue`). **Copie `ENCRYPTION_KEY` a su gestor de
   contraseñas ahora mismo**: sin ella los campos cifrados y los respaldos son irrecuperables. No la rote.
6. Espere a que `sigo-backend` esté *Live* (healthcheck `/api/health`). En el primer arranque se aplican las migraciones
   (incluyen los triggers de inmutabilidad de la auditoría) y se crea el administrador inicial (`BOOTSTRAP_PRODUCTION`).
   Después de la primera vez puede dejar `BOOTSTRAP_PRODUCTION=true`: es idempotente.
7. Abra la URL del gateway, ingrese con el administrador, configure el **MFA** (obligatorio: QR + código + códigos de
   recuperación) y cambie la contraseña inicial (*Mi cuenta*).
8. Cree los usuarios restantes, consultorios, sillones, profesionales y horarios (*Administración*).

## Variables de entorno (resumen)

Ver `.env.production.example` (autoalojado) y `render.yaml` (Render). En producción el backend **se niega a arrancar** si
detecta secretos de desarrollo (`JWT_ACCESS_SECRET`, `ENCRYPTION_KEY` o la clave de almacenamiento por defecto).
`SWAGGER_ENABLED` es `false` por defecto en producción (la documentación no se publica).

## Verificación posterior al despliegue

```bash
curl -s https://<gateway>/api/health            # {"status":"ok","db":"up","redis":"up",...}
curl -sI https://<gateway>/ | grep -i -E "strict-transport|content-security|x-frame"
```
En la aplicación, *Administración → Sistema y respaldos* debe mostrar los tres servicios «En línea».

## Despliegues posteriores y reversión

`autoDeploy` está en `false`: cada versión se despliega a mano (*Manual Deploy*) tras pasar el CI.
Las migraciones son **aditivas** (ver `reversion.md`). Para volver a una versión anterior use *Rollback* de Render
sobre el servicio y, si la migración fue destructiva (no hay ninguna en v1.0.0), restaure el respaldo previo.
