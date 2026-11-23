# Cible « test » : app-test et db-test (lab livraison). infra/compose.test.yaml, démarrée par « usine deploy test ».
# shellcheck shell=bash

target_up() {
  fail "La cible test se démarre avec l'image de ton pipeline : usine deploy test"
  return 1
}

target_down() {
  if ! docker container inspect app-test >/dev/null 2>&1 && ! docker container inspect db-test >/dev/null 2>&1; then
    ok "app-test et db-test : déjà arrêtés"
    return 0
  fi
  APP_TEST_IMAGE=unused USINE_NETWORK="$USINE_NETWORK" \
    docker compose -f "$USINE_ROOT/infra/compose.test.yaml" down --volumes --remove-orphans >/dev/null 2>&1 \
    || docker rm -f app-test db-test >/dev/null 2>&1 || true
  ok "app-test et db-test supprimés"
}

target_status() {
  local name
  for name in app-test db-test; do info "$name : $(container_state "$name")"; done
}
