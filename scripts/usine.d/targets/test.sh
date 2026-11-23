#!/usr/bin/env bash
# Cible « test » : app-test et db-test (infra/compose.test.yaml, flux Fournitures). Se lance par « usine deploy test ».

_test_compose() {
  APP_TEST_IMAGE=unused USINE_NETWORK="$USINE_NETWORK" docker compose -f "$USINE_ROOT/infra/compose.test.yaml" "$@"
}

target_up() { die "l'environnement de test se lance par « usine deploy test » : c'est lui qui choisit l'image."; }

target_down() {
  title "Environnement de test"
  _test_compose down --volumes --remove-orphans >/dev/null 2>&1 || die "impossible d'arrêter app-test et db-test."
  ok "app-test et db-test supprimés (volumes compris)"
}

target_status() {
  local line
  line="$(docker ps --filter name='^(app-test|db-test)$' --format '{{.Names}} {{.Status}}' | tr '\n' ',' | sed 's/,$//; s/,/, /g')"
  info "test : ${line:-arrêté}"
}
