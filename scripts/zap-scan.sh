#!/bin/sh
# DAST con OWASP ZAP contra el sistema desplegado en Docker (https://localhost). Gratuito.
#   1) baseline: spider + reglas pasivas sobre la SPA y el gateway TLS
#   2) API autenticada: ataque activo a TODOS los endpoints del contrato OpenAPI con un token de odontólogo
# Requiere un sistema NUEVO y desechable (el ataque activo crea datos basura) con:
#   THROTTLE_AUTH_LIMIT=1000 THROTTLE_LIMIT=100000 ACCESS_TOKEN_TTL_SECONDS=900 docker compose up -d --build --wait
# Uso: ./scripts/zap-scan.sh   (informes en documentacion/evidencias/zap/)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/documentacion/evidencias/zap"
TARGET="${TARGET:-https://host.docker.internal}"
mkdir -p "$OUT"
chmod 777 "$OUT"

echo "== 1/2 ZAP baseline (sin autenticar)"
MSYS_NO_PATHCONV=1 docker run --rm -v "$OUT:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t "$TARGET" -I -r baseline.html -J baseline.json \
  -z "-config connection.sslAcceptAll=true" || true

echo "== 2/2 ZAP API autenticada (OpenAPI)"
TOKEN="$(node "$ROOT/scripts/zap-token.js")"
cp "$ROOT/backend/openapi.json" "$OUT/openapi.json"
MSYS_NO_PATHCONV=1 docker run --rm -v "$OUT:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t /zap/wrk/openapi.json -f openapi -O "$TARGET" -I -T 12 -r api.html -J api.json \
  -z "-config connection.sslAcceptAll=true \
      -config replacer.full_list\(0\).description=auth \
      -config replacer.full_list\(0\).enabled=true \
      -config replacer.full_list\(0\).matchtype=REQ_HEADER \
      -config replacer.full_list\(0\).matchstr=Authorization \
      -config replacer.full_list\(0\).regex=false \
      -config replacer.full_list\(0\).replacement=Bearer\ $TOKEN" || true

echo "Informes: $OUT"
