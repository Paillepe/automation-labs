#!/usr/bin/env bash
# Test autonome de la cible de test (infra/compose.test.yaml, « usine deploy test ») avec une image construite en
# local, sans registre. Vérifie : app-test exécute exactement l'image demandée, prête avec db-test, ports,
# idempotence, remplacement par une nouvelle version. Nettoie derrière lui.
# ATTENTION : remplace l'environnement de test du poste (app-test, db-test). Jamais pendant une séance.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

IMAGE_A="usine-t-target:a"
IMAGE_B="usine-t-target:b"
COMMIT="$(git -C "$ROOT" rev-parse HEAD)"

down() { APP_TEST_IMAGE=unused docker compose -f "$ROOT/infra/compose.test.yaml" down --volumes --remove-orphans >/dev/null 2>&1 || true; }
cleanup() {
  down
  docker image rm "$IMAGE_A" "$IMAGE_B" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

probe() { docker exec db-test wget -q -T 2 -O - "$@" 2>/dev/null; }
deploy() { "$ROOT/scripts/usine" deploy test "$1"; }

section "Construction de deux versions de l'image"
build_app "$IMAGE_A" 1.0.0 "$COMMIT"
build_app "$IMAGE_B" 1.1.0 "${COMMIT:0:7}-b"
pass "images $IMAGE_A et $IMAGE_B"

section "usine deploy test"
if out="$(deploy "$IMAGE_A" 2>&1)"; then pass "usine deploy test $IMAGE_A (code 0)"; else
  miss "usine deploy test $IMAGE_A (code 0)"
  echo "$out" | tail -n 15
fi
expect "app-test exécute exactement l'image demandée" "$(docker image inspect "$IMAGE_A" --format '{{.Id}}')" "$(docker inspect app-test --format '{{.Image}}')"
expect "/ready est vert (db-test joignable)" '{"status":"ready"}' "$(probe http://app-test:8080/ready)"
expect "/version renvoie le commit construit" "{\"service\":\"reservations\",\"version\":\"1.0.0\",\"commit\":\"$COMMIT\"}" "$(probe http://app-test:8080/version)"
expect_match "une réservation s'écrit dans db-test" '"id":1' \
  "$(probe --header 'content-type: application/json' --post-data '{"numero_carte":"VAL000001","titre":"Essai","site_id":1}' http://app-test:8080/api/reservations)"
expect "db-test ne publie aucun port" "" "$(docker port db-test)"
expect "app-test ne publie que sur 127.0.0.1" "8080/tcp -> 127.0.0.1:${USINE_TEST_PORT:-18080}" "$(docker port app-test)"
expect_match "les deux conteneurs sont sur le réseau usine" 'app-test.*db-test|db-test.*app-test' \
  "$(docker network inspect usine --format '{{range .Containers}}{{.Name}} {{end}}')"

section "Idempotence"
id1="$(docker inspect app-test --format '{{.Id}}')"
if deploy "$IMAGE_A" >/dev/null 2>&1; then pass "seconde exécution (code 0)"; else miss "seconde exécution (code 0)"; fi
expect "app-test n'est pas recréé" "$id1" "$(docker inspect app-test --format '{{.Id}}')"

section "Nouvelle version"
if deploy "$IMAGE_B" >/dev/null 2>&1; then pass "usine deploy test $IMAGE_B (code 0)"; else miss "usine deploy test $IMAGE_B (code 0)"; fi
expect_match "/version renvoie la nouvelle version" '"version":"1.1.0"' "$(probe http://app-test:8080/version)"
expect_match "les données de db-test sont conservées" '"numero_carte":"VAL000001"' "$(probe http://app-test:8080/api/reservations)"

section "Erreurs"
set +e
out="$("$ROOT/scripts/usine" deploy test usine-t-target:absente 2>&1)"
rc=$?
set -e
expect "image absente : code 1" 1 "$rc"
expect_match "message explicite" 'introuvable' "$out"

finish
