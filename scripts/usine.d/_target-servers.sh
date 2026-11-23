# Cible « servers » : srv-test (labs demarrage à livraison). infra/compose.servers.yaml.
# shellcheck shell=bash

servers_compose() {
  USINE_NETWORK="$USINE_NETWORK" docker compose -f "$USINE_ROOT/infra/compose.servers.yaml" "$@"
}

target_up() {
  require_docker
  ensure_network "$USINE_NETWORK"
  ensure_lab_key
  info "Construction de l'image serveur et démarrage de srv-test…"
  local out
  if ! out="$(servers_compose up --detach --build 2>&1)"; then
    fail "srv-test ne démarre pas."
    tail -n 8 <<<"$out" | sed 's/^/      /'
    return 1
  fi
  if [[ -n "$(self_container)" ]]; then
    wait_ssh srv-test 30 || {
      fail "srv-test a démarré mais n'accepte pas la clé de lab en SSH."
      hint "docker logs srv-test"
      return 1
    }
  fi
  ok "srv-test est prêt : ssh -i ~/.ssh/usine_lab deploy@srv-test"
}

target_down() {
  docker container inspect srv-test >/dev/null 2>&1 || {
    ok "srv-test : déjà arrêté"
    return 0
  }
  servers_compose down --volumes --remove-orphans >/dev/null 2>&1 || docker rm -f srv-test >/dev/null
  ok "srv-test supprimé"
}

target_status() {
  info "srv-test : $(container_state srv-test)"
}
