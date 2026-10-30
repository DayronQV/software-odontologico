#!/bin/sh
set -e

# Aplica las migraciones (incluye los triggers de auditoría inmutable) antes de arrancar.
npx prisma migrate deploy

# Usuarios semilla de desarrollo (uno por rol). Desactivar con SEED_ON_START=false.
if [ "$SEED_ON_START" = "true" ]; then
  node dist/seed.js
fi

exec node dist/main.js
