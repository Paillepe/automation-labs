#!/usr/bin/env bash
# Test autonome de l'application (app/) : lint et tests unitaires sous Node.js 24, puis l'image elle-même :
# sans base, avec base, réglage obligatoire, pannes injectées, arrêt propre. Nettoie derrière lui.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

P=usine-t-app
IMAGE="$P:test"
NET="$P-net"

cleanup() {
  docker rm -f "$P-nodb" "$P-db" "$P-pg" "$P-fault" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker image rm "$IMAGE" "$P:quality" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

# http <conteneur> <méthode> <chemin> [corps] [jeton] : affiche « statut corps », depuis le conteneur lui-même.
http() {
  docker exec "$1" node -e '
    const [m, p, body, token] = process.argv.slice(1);
    const headers = { "content-type": "application/json" };
    if (token) headers["x-fault-token"] = token;
    fetch("http://127.0.0.1:8080" + p, { method: m, headers, body: body || undefined, signal: AbortSignal.timeout(1500) })
      .then(async (r) => console.log(r.status, await r.text()))
      .catch(() => { console.log("000 sans-reponse"); });
  ' "$2" "$3" "${4:-}" "${5:-}"
}
status() { http "$@" | cut -d' ' -f1; }
# status_is <attendu> <conteneur> <méthode> <chemin> : pour wait_for, qui réévalue à chaque essai.
status_is() {
  local want="$1"
  shift
  [[ "$(status "$@")" == "$want" ]]
}

section "Qualité : lint et tests unitaires sous ${NODE_IMAGE%%@*}"
if docker build --quiet -t "$P:quality" -f - "$ROOT/app" >/dev/null 2>"/tmp/$P.build" <<DOCKERFILE; then
FROM $NODE_IMAGE
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run lint && npm test && test -s reports/junit.xml && grep -q '<testsuites' reports/junit.xml
DOCKERFILE
  pass "npm ci, npm run lint, npm test et rapport JUnit"
else
  miss "npm ci, npm run lint, npm test et rapport JUnit"
  tail -n 30 "/tmp/$P.build"
fi

section "Image : construction avec version et SHA en arguments"
build_app "$IMAGE" 9.9.9 test-sha-0001
pass "docker build app/"
docker network create "$NET" >/dev/null

section "Sans base"
docker run -d --name "$P-nodb" --network "$NET" "$IMAGE" >/dev/null
wait_for 10 http "$P-nodb" GET /health
expect "/health répond 200" 200 "$(status "$P-nodb" GET /health)"
expect "/ready répond 503" 503 "$(status "$P-nodb" GET /ready)"
expect "/version renvoie version et SHA" '200 {"service":"reservations","version":"9.9.9","commit":"test-sha-0001"}' "$(http "$P-nodb" GET /version)"
expect "/api/reservations répond 503 sans base" 503 "$(status "$P-nodb" GET /api/reservations)"
http "$P-nodb" GET /api/sites >/dev/null
expect_match "/metrics : compteur par statut" 'http_requests_total\{method="GET",route="/api/sites",status="200"\} 1' "$(http "$P-nodb" GET /metrics)"
expect_match "/metrics : histogramme de durée" 'http_request_duration_seconds_bucket\{' "$(http "$P-nodb" GET /metrics)"
logs="$(docker logs "$P-nodb" 2>&1)"
check "logs : chaque ligne est un objet JSON" jq -e -s 'length > 0 and all(type == "object")' <<<"$logs"
check "logs : la requête porte un request_id" jq -e -s 'any(.event == "request" and (.request_id | length) > 0)' <<<"$logs"

section "Réglage rendu obligatoire"
set +e
out="$(docker run --rm -e APP_REQUIRED_ENV=RESERVATION_HOLD_DAYS "$IMAGE" 2>&1)"
rc=$?
set -e
expect "l'application refuse de démarrer (code 1)" 1 "$rc"
expect_match "log fatal qui nomme le réglage" '"level":"fatal".*"setting":"RESERVATION_HOLD_DAYS"' "$out"
expect "avec le réglage, elle démarre" 200 "$(
  docker run -d --name "$P-fault" -e APP_REQUIRED_ENV=RESERVATION_HOLD_DAYS -e RESERVATION_HOLD_DAYS=10 "$IMAGE" >/dev/null
  wait_for 10 http "$P-fault" GET /health
  status "$P-fault" GET /api/config
)"
expect_match "le réglage est appliqué" '"holdDays":10' "$(http "$P-fault" GET /api/config)"
docker rm -f "$P-fault" >/dev/null

section "Avec base"
docker run -d --name "$P-pg" --network "$NET" -e POSTGRES_DB=reservations -e POSTGRES_USER=reservations \
  -e POSTGRES_PASSWORD=lab-password "$(grep -E '^postgres:' "$ROOT/infra/images.txt" | head -n 1)" >/dev/null
docker run -d --name "$P-db" --network "$NET" -e DB_HOST="$P-pg" -e DB_PASSWORD=lab-password "$IMAGE" >/dev/null
if wait_for 30 status_is 200 "$P-db" GET /ready; then pass "/ready passe à 200 quand la base répond"; else miss "/ready passe à 200 quand la base répond"; fi
expect "réservation enregistrée (201)" 201 "$(status "$P-db" POST /api/reservations '{"numero_carte":"VAL000123","titre":"Le Petit Prince","site_id":3}')"
expect_match "réservation relue" '"numero_carte":"VAL000123"' "$(http "$P-db" GET /api/reservations)"
docker stop "$P-pg" >/dev/null
if wait_for 10 status_is 503 "$P-db" GET /ready; then pass "base arrêtée : /ready repasse à 503"; else miss "base arrêtée : /ready repasse à 503"; fi
expect "base arrêtée : /health reste à 200" 200 "$(status "$P-db" GET /health)"
check "le passage à « non prête » est journalisé avec sa raison" \
  jq -e -s 'any(.event == "not_ready" and (.reason | length) > 0)' <<<"$(docker logs "$P-db" 2>&1)"

section "Pannes injectées"
docker run -d --name "$P-fault" -e FAULT_TOKEN=jeton-de-lab -e SHUTDOWN_DELAY_MS=500 "$IMAGE" >/dev/null
wait_for 10 http "$P-fault" GET /health
expect "sans jeton : 403" 403 "$(status "$P-fault" POST /fault '{"errorRate":1}')"
expect "sans FAULT_TOKEN : injection désactivée (404)" 404 "$(status "$P-nodb" POST /fault '{"errorRate":1}' x)"
expect "taux d'erreur à 100 %" 200 "$(status "$P-fault" POST /fault '{"errorRate":1}' jeton-de-lab)"
body="$(http "$P-fault" GET /api/sites)"
expect "requête métier en erreur : 500" 500 "${body%% *}"
ref="$(docker logs "$P-fault" 2>&1 | jq -r -s 'map(select(.event == "fault_error")) | last | .error_ref')"
expect_match "référence unique dans les logs" '^ERR-[0-9A-F]{8}$' "$ref"
if [[ "$body" != *"$ref"* ]]; then pass "la référence n'est pas dans la réponse"; else miss "la référence n'est pas dans la réponse"; fi
expect "/health n'est pas touché" 200 "$(status "$P-fault" GET /health)"
expect "retrait des pannes" 200 "$(status "$P-fault" DELETE /fault '' jeton-de-lab)"
expect "requête métier de nouveau à 200" 200 "$(status "$P-fault" GET /api/sites)"
expect "latence injectée acceptée" 200 "$(status "$P-fault" POST /fault '{"latencyMs":300}' jeton-de-lab)"
status "$P-fault" DELETE /fault '' jeton-de-lab >/dev/null
expect "gel de 3 s demandé (202)" 202 "$(status "$P-fault" POST /fault/freeze '{"seconds":3}' jeton-de-lab)"
sleep 0.3
expect "pendant le gel, /health ne répond plus" 000 "$(status "$P-fault" GET /health)"
if wait_for 6 status_is 200 "$P-fault" GET /health; then pass "après le gel, /health répond de nouveau"; else miss "après le gel, /health répond de nouveau"; fi

section "Arrêt propre"
start=$SECONDS
docker stop -t 15 "$P-fault" >/dev/null
expect "SIGTERM : code de sortie 0" 0 "$(docker inspect "$P-fault" --format '{{.State.ExitCode}}')"
if ((SECONDS - start < 10)); then pass "arrêt en moins de 10 s"; else miss "arrêt en moins de 10 s"; fi
check "arrêt journalisé" jq -e -s 'any(.event == "stopped")' <<<"$(docker logs "$P-fault" 2>&1)"

finish
