#!/bin/sh
# Monitor mínimo de disponibilidad: consulta /api/health y avisa a un webhook (Slack/Discord/Teams/Mattermost).
# Alerta tras FAILS_BEFORE_ALERT fallos consecutivos y avisa cuando el sistema se recupera.
#   HEALTH_URL=https://clinica.ejemplo.com/api/health ALERT_WEBHOOK_URL=https://hooks.slack.com/... ./scripts/monitor.sh
# Programar cada minuto:  */1 * * * * /opt/sigo/scripts/monitor.sh
set -u

HEALTH_URL="${HEALTH_URL:-https://localhost/api/health}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
FAILS_BEFORE_ALERT="${FAILS_BEFORE_ALERT:-2}"
STATE_FILE="${STATE_FILE:-/tmp/sigo-monitor.state}"

fails=0
alerted=0
[ -f "$STATE_FILE" ] && . "$STATE_FILE"

notify() {
  echo "$(date -u +%FT%TZ) $1"
  [ -n "$ALERT_WEBHOOK_URL" ] || return 0
  curl -s -m 10 -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"SIGO-Dental: $1\"}" "$ALERT_WEBHOOK_URL" >/dev/null || true
}

if curl -sk -m 10 -f "$HEALTH_URL" >/dev/null; then
  if [ "$alerted" -eq 1 ]; then notify "RECUPERADO ($HEALTH_URL responde correctamente)"; fi
  fails=0
  alerted=0
else
  fails=$((fails + 1))
  if [ "$fails" -ge "$FAILS_BEFORE_ALERT" ] && [ "$alerted" -eq 0 ]; then
    notify "CAÍDO: $HEALTH_URL falló $fails veces seguidas"
    alerted=1
  fi
fi

printf 'fails=%s\nalerted=%s\n' "$fails" "$alerted" > "$STATE_FILE"
