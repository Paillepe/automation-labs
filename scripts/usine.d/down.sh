#!/usr/bin/env bash
# usine: Arrête et supprime une cible, volumes compris ; sans argument, tout : usine down [cible…]
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"

if [[ "${1:-}" == -h || "${1:-}" == --help ]]; then
  echo "Usage : usine down [cible…]   (sans argument : tout ; cibles : $(list_targets | tr '\n' ' '))"
  exit 0
fi
require_docker
if [[ $# -eq 0 ]]; then
  mapfile -t targets < <(list_targets)
else
  targets=("$@")
fi
status=0
for target in "${targets[@]}"; do
  title "Arrêt : $target"
  run_target down "$target" || status=1
done
exit "$status"
