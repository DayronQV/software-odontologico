# Migraciones seguras, plan de reversión y lista de verificación de salida

## Migraciones

- Se aplican con `prisma migrate deploy` al arrancar el backend (idempotente: solo corre las pendientes).
- Las 4 migraciones de v1.0.0 son **aditivas** (crean tablas, columnas, índices y triggers; ninguna borra datos), por lo que
  la versión anterior del código sigue funcionando sobre el esquema nuevo.
- Regla de cambio: *expandir → migrar → contraer* en versiones distintas; nunca `DROP`/`RENAME` en el mismo despliegue que
  cambia el código. Revisar el SQL con `npx prisma migrate dev --create-only` antes de confirmar.
- La auditoría y los registros clínicos tienen triggers de inmutabilidad (también bloquean `TRUNCATE`): una migración nunca
  debe deshabilitarlos.

## Plan de reversión

| Situación | Acción | Tiempo |
|---|---|---|
| Bug en el código sin migración nueva | Render: *Rollback* al despliegue anterior / `git checkout <tag> && docker compose up -d --build` | < 10 min |
| Bug con migración aditiva | Igual que arriba (el esquema nuevo es compatible hacia atrás) | < 10 min |
| Migración dañina o datos corruptos | 1) `docker compose stop backend` 2) restaurar el respaldo previo (`restauracion.md`) 3) desplegar la versión anterior | 30–60 min |
| Pérdida del servidor | Nuevo servidor + `guia-despliegue.md` + restaurar último respaldo con la misma `ENCRYPTION_KEY` | 1–2 h |

**Antes de cada despliegue:** ejecutar un respaldo (`backup backup`) y anotar su `id`.

## Lista de verificación de salida a producción

- [ ] CI en verde (tipos, lint, pruebas, cobertura ≥ 80 % en críticos, Spectral, SAST, dependencias, secretos, Trivy)
- [ ] Sin hallazgos Altos/Críticos abiertos (`informe-seguridad.md`)
- [ ] Secretos de producción generados (no los de desarrollo; el backend lo exige) y `ENCRYPTION_KEY` respaldada fuera del servidor
- [ ] Certificado TLS válido; TLS 1.2 rechazado, TLS 1.3 aceptado
- [ ] `SWAGGER_ENABLED=false`; sin usuarios `@sigo.test`; `SEED_ON_START=false`
- [ ] Administrador inicial con MFA configurado y contraseña inicial cambiada; `INITIAL_ADMIN_PASSWORD` retirada del entorno
- [ ] SMTP real probado (recordatorio de prueba); WhatsApp/SMS en modo simulado (costo cero)
- [ ] Primer respaldo ejecutado y **restauración de prueba** realizada
- [ ] Alertas de disponibilidad configuradas (`scripts/monitor.sh` o monitor externo)
- [ ] Prueba de carga (150 usuarios) y RNF-01 (< 1,5 s) con evidencia (`informe-carga.md`)
- [ ] UAT firmado (`uat/acta-uat.md`) y manuales entregados al personal
- [ ] Plan de reversión leído por el responsable de operación
