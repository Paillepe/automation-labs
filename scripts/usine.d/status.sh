#!/usr/bin/env bash
# usine: Ce qui tourne, versions servies et mémoire consommée
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=_targets.sh
source "$USINE_D/_targets.sh"

require_docker
title "Cibles"
for target in $(target_names); do
  run_target "$target" status || true
done

title "Versions servies (/version)"
found=0
for name in srv-test app-test srv-web-1 srv-web-2; do
  docker container inspect "$name" --format '{{.State.Running}}' 2>/dev/null | grep -q true || continue
  found=1
  version="$(curl -fsS -m 2 "http://$name:8080/version" 2>/dev/null || echo 'ne répond pas')"
  info "$name : $version"
done
((found)) || info "aucun serveur ni conteneur de test en marche"

title "Mémoire (docker stats)"
mapfile -t running < <(docker ps --format '{{.Names}}' | grep -E '^(srv-|app-test$|db-test$|db$|k3d-|usine-)' | grep -v -- '-tools$' || true)
if [[ "${#running[@]}" -eq 0 ]]; then
  info "aucun conteneur du cours en marche"
else
  docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}' "${running[@]}" 2>/dev/null | sed 's/^/  /' \
    || info "mesure impossible pour l'instant (un conteneur vient de s'arrêter) : relance usine status"
fi
