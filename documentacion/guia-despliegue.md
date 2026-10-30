# Guía de despliegue autoalojado (Docker Compose)

Para un servidor propio o VPS con Docker 24+ y Compose v2. Para Render ver `despliegue-render.md`.

## 1. Preparar el servidor

- Linux con Docker y Compose; puertos 80 y 443 abiertos; reloj sincronizado (NTP); zona horaria del servidor indiferente
  (la aplicación trabaja en `America/Bogota`).
- Dominio apuntando al servidor (`clinica.ejemplo.com`).

## 2. Secretos y variables

```bash
cp .env.production.example .env.production
openssl rand -hex 32        # JWT_ACCESS_SECRET
openssl rand -base64 32     # ENCRYPTION_KEY  (¡guárdela FUERA del servidor!)
openssl rand -base64 24     # contraseñas de PostgreSQL, Redis y MinIO
echo "sigo-key:$(openssl rand -base64 32)"   # MINIO_KMS_SECRET_KEY
```
Complete todas las variables de `.env.production` (el `docker compose` falla si falta una obligatoria). El archivo
**no se versiona** (`.gitignore`).

## 3. Certificado TLS 1.3

El gateway (`docker/nginx/nginx.conf`) solo acepta TLS 1.3. Coloque el certificado en `./certs/`:

- **Gratis con Let's Encrypt** (recomendado):
  ```bash
  sudo certbot certonly --standalone -d clinica.ejemplo.com
  sudo cp /etc/letsencrypt/live/clinica.ejemplo.com/fullchain.pem certs/server.crt
  sudo cp /etc/letsencrypt/live/clinica.ejemplo.com/privkey.pem  certs/server.key
  ```
  Renovación (cron mensual): `certbot renew --deploy-hook "cp … && docker compose -f docker-compose.prod.yml restart nginx"`.
- **Autofirmado** (solo pruebas/intranet): 
  `openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout certs/server.key -out certs/server.crt -subj "/CN=clinica.ejemplo.com"`.

## 4. Levantar

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps          # todos (healthy)
```
Orden garantizado por *healthchecks*: PostgreSQL/Redis/MinIO → buckets → backend (migraciones + administrador
inicial + catálogos base) → frontend → nginx. Todos con `restart: unless-stopped` y logs rotados (10 MB × 5).

## 5. Verificación

```bash
curl -sk https://clinica.ejemplo.com/api/health
openssl s_client -connect clinica.ejemplo.com:443 -tls1_2 </dev/null 2>&1 | grep -i "alert\|handshake failure"   # TLS 1.2 debe fallar
openssl s_client -connect clinica.ejemplo.com:443 -tls1_3 </dev/null 2>&1 | grep "Protocol"                       # TLSv1.3
```

## 6. Primer ingreso

Ingrese con `INITIAL_ADMIN_EMAIL`, configure el MFA (QR + código; guarde los códigos de recuperación) y cambie la
contraseña. **Elimine `INITIAL_ADMIN_PASSWORD` de `.env.production`** una vez creado el administrador
(el arranque es idempotente: no la vuelve a usar).

## 7. Actualizar a una nueva versión

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backup backup   # respaldo previo
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
Las migraciones se aplican solas al arrancar el backend (`prisma migrate deploy`).
