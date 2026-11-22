#!/usr/bin/env bash
# Test autonome de l'image serveur (infra/server/) : Node.js 24 identique au devcontainer, script de service
# /etc/init.d/reservations (start, stop, restart, status), relance après redémarrage du conteneur, SSH avec la clé
# de lab et sudo. Le code est déposé par docker cp (aucune montée de fichiers). Nettoie derrière lui.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

P=usine-t-srv
IMAGE="$P:test"
APP_IMAGE="$P-app:test"
NET="$P-net"
SRV="$P-1"
CLIENT="$P-2"

cleanup() {
  docker rm -f "$SRV" "$CLIENT" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" "$APP_IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

on() { docker exec "$SRV" "$@"; }                      # en root
as_deploy() { docker exec -u deploy "$SRV" "$@"; }     # comme l'étudiant, par sudo
svc() { as_deploy sudo service reservations "$@"; }
svc_rc() {
  set +e
  svc "$@" >/dev/null 2>&1
  echo $?
  set -e
}
http_status() { on curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:8080$1" || true; }
http_ok() { [[ "$(http_status "$1")" == 200 ]]; }

section "Construction"
docker build --quiet -f "$ROOT/infra/server/Dockerfile" -t "$IMAGE" "$ROOT/infra" >/dev/null
pass "docker build -f infra/server/Dockerfile infra"
build_app "$APP_IMAGE" 2.0.0 srv-sha-0002
docker network create "$NET" >/dev/null
docker run -d --name "$SRV" --hostname srv-test --network "$NET" "$IMAGE" >/dev/null
docker run -d --name "$CLIENT" --network "$NET" "$IMAGE" >/dev/null

section "Node.js 24"
want="v$(sed -n 's/^ARG NODE_VERSION=//p' "$ROOT/.devcontainer/Dockerfile")"
expect "même version de Node.js que le devcontainer" "$want" "$(as_deploy node --version)"
check "npm fonctionne" as_deploy npm --version

section "Service sans code"
expect "status : arrêté (code 3)" 3 "$(svc_rc status)"
expect "start sans code : échec (code 1)" 1 "$(svc_rc start)"
expect_match "message explicite" 'aucun code déployé' "$(svc start 2>&1 || true)"

section "Déploiement du code et démarrage"
cid="$(docker create "$APP_IMAGE")"
docker cp "$cid:/app" - | docker cp - "$SRV:/tmp/"
docker rm "$cid" >/dev/null
as_deploy sh -c 'cp -a /tmp/app/. /opt/reservations/'
as_deploy sh -c 'printf "APP_VERSION=2.0.0\nAPP_COMMIT=srv-sha-0002\nSHUTDOWN_DELAY_MS=0\n" > /etc/reservations/reservations.env'
pass "code déposé par deploy dans /opt/reservations, environnement dans /etc/reservations"
expect "start (code 0)" 0 "$(svc_rc start)"
if wait_for 10 http_ok /health; then pass "/health répond 200"; else miss "/health répond 200"; fi
expect "/version lit le fichier d'environnement" '{"service":"reservations","version":"2.0.0","commit":"srv-sha-0002"}' "$(on curl -s http://127.0.0.1:8080/version)"
expect "/ready répond 503 (pas de base)" 503 "$(http_status /ready)"
# shellcheck disable=SC2016 # développé dans le conteneur, pas ici
expect "l'application tourne sous deploy" deploy "$(on sh -c 'stat -c %U /proc/$(cat /run/reservations.pid)')"
expect "start une seconde fois : sans effet (code 0)" 0 "$(svc_rc start)"
check "logs JSON dans /var/log/reservations/reservations.log" \
  on sh -c 'tail -n 1 /var/log/reservations/reservations.log | grep -q "^{\"time\""'

section "Redémarrage"
pid1="$(on cat /run/reservations.pid)"
expect "restart (code 0)" 0 "$(svc_rc restart)"
pid2="$(on cat /run/reservations.pid)"
if [[ "$pid1" != "$pid2" ]]; then pass "nouveau processus après restart"; else miss "nouveau processus après restart"; fi
if wait_for 10 http_ok /health; then pass "/health répond après restart"; else miss "/health répond après restart"; fi

section "Réglage obligatoire manquant"
as_deploy sh -c 'echo APP_REQUIRED_ENV=RESERVATION_HOLD_DAYS >> /etc/reservations/reservations.env'
expect "restart : échec (code 1)" 1 "$(svc_rc restart)"
expect_match "le log de l'application est affiché" 'Réglage obligatoire absent : RESERVATION_HOLD_DAYS' "$(svc start 2>&1 || true)"
as_deploy sh -c 'echo RESERVATION_HOLD_DAYS=5 >> /etc/reservations/reservations.env'
expect "réglage ajouté : start (code 0)" 0 "$(svc_rc start)"

section "Redémarrage du conteneur"
docker restart "$SRV" >/dev/null
if wait_for 15 http_ok /health; then pass "l'application est relancée avec le serveur"; else miss "l'application est relancée avec le serveur"; fi

section "SSH avec la clé de lab, depuis un autre serveur"
docker cp "$ROOT/infra/keys/lab_ed25519" "$CLIENT:/tmp/lab_key"
docker exec "$CLIENT" sh -c 'chmod 600 /tmp/lab_key'
ssh_cmd=(docker exec "$CLIENT" ssh -i /tmp/lab_key -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o BatchMode=yes "deploy@$SRV")
wait_for 10 "${ssh_cmd[@]}" true || true
expect_match "ssh deploy@serveur puis sudo service reservations status" 'en marche' "$("${ssh_cmd[@]}" sudo service reservations status 2>&1 || true)"

section "Arrêt"
expect "stop (code 0)" 0 "$(svc_rc stop)"
expect "status : arrêté (code 3)" 3 "$(svc_rc status)"
expect "stop une seconde fois (code 0)" 0 "$(svc_rc stop)"
expect "plus rien n'écoute sur 8080" 000 "$(http_status /health)"

finish
