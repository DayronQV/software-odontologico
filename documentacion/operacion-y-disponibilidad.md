# Operación, monitoreo y estrategia de disponibilidad (RNF-02)

**Objetivo:** 99,9 % de disponibilidad en el horario de atención 07:00–21:00 (14 h × 30 días = 420 h/mes ⇒ ≤ 25 min de
indisponibilidad al mes dentro de ese horario).

## Estrategia

| Riesgo | Medida implementada |
|---|---|
| Caída de un contenedor | `restart: unless-stopped` en todos los servicios; Render reinicia el servicio fallido |
| Arranque desordenado | `depends_on` con `condition: service_healthy` (PostgreSQL → Redis/MinIO → backend → frontend → nginx) |
| Servicio «vivo» pero roto | *Healthchecks* reales: `/api/health` verifica PostgreSQL y Redis (503 si falla); Docker/Render marcan no saludable y reinician |
| Pérdida de datos | Respaldo diario cifrado + retención 30 días + restauración probada (`restauracion.md`) |
| Mantenimiento | Ventana fuera de 07:00–21:00; migraciones aditivas; reversión documentada (`reversion.md`) |
| Sobrecarga | Prueba de carga con 150 usuarios (`informe-carga.md`); limitador de frecuencia por IP; consultas indexadas |
| Degradación de integraciones | WhatsApp/SMS/facturación fiscal/pagos tras interfaces: si fallan, el sistema sigue (cola con reintentos y bandeja de pendientes) |
| Cortes del proveedor | En Render, planes pagos sin *spin-down*; en autoalojado, VPS con snapshot diario del proveedor |

## Monitoreo

- **Panel del administrador** (*Administración → Sistema y respaldos*, `GET /api/system/status`): estado y latencia de
  PostgreSQL, Redis y almacenamiento; memoria; tamaño y conexiones de la base; cola de recordatorios (pendientes/fallidos);
  actividad de 24 h (eventos de auditoría, ingresos fallidos, exportaciones); lista de respaldos.
- **Visor de auditoría** (*Auditoría*): consulta y verificación de la cadena de hashes inmutable (admin y auditor).
- **Logs**: salida estándar en JSON de cada contenedor, rotación 10 MB × 5 (`docker compose logs -f backend`; en Render, *Logs*).
- **Alertas**: `scripts/monitor.sh` consulta `/api/health` cada minuto (cron o *scheduled task*) y avisa a un *webhook*
  (Slack/Discord/Teams/Mattermost, gratis) tras 2 fallos consecutivos y al recuperarse:
  ```bash
  */1 * * * * HEALTH_URL=https://clinica.ejemplo.com/api/health ALERT_WEBHOOK_URL=https://hooks.slack.com/… /opt/sigo/scripts/monitor.sh
  ```
  Para un monitor externo gratuito use UptimeRobot/BetterStack apuntando a `/api/health` (intervalo de 5 min).

## Rutina operativa

| Frecuencia | Tarea |
|---|---|
| Diaria | Revisar que el último respaldo sea de hoy (panel) y que no haya envíos fallidos en cola |
| Semanal | Revisar ingresos fallidos y exportaciones; verificar cadena de auditoría (`/audit/verify`) |
| Mensual | Prueba de restauración en base de prueba; `npm audit`; actualizar imágenes base |
| Anual | Renovar certificado (Let's Encrypt lo hace solo cada 90 días), revisar usuarios y roles |

## Incidentes frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| `/api/health` 503 con `db: down` | PostgreSQL caído o saturado | `docker compose ps`, `logs postgres`; reiniciar; restaurar si hay corrupción |
| Usuarios expulsados cada pocos minutos | Redis caído (sesión deslizante) | Reiniciar Redis; las sesiones se renuevan al volver a ingresar |
| Recordatorios no salen | Cola con fallos / SMTP mal configurado | Panel «Envíos fallidos»; revisar `SMTP_*`; reintentar desde la bandeja |
| Adjuntos no cargan | Almacenamiento S3 caído o credenciales | Panel (Documentos «Caído»); revisar `S3_*` |
| «Demasiadas solicitudes» (429) | Limitador de frecuencia (fuerza bruta/script) | Esperar 1 min; revisar ingresos fallidos en la auditoría |
