#!/usr/bin/env bash
# usine: Arrête et supprime une cible, volumes compris : usine down [cible…] (sans argument : tout)
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=_targets.sh
source "$USINE_D/_targets.sh"

require_docker
if [[ $# -eq 0 ]]; then
  mapfile -t all < <(target_names | tr ' ' '\n')
  set -- "${all[@]}"
fi
for target in "$@"; do require_target "$target"; done
for target in "$@"; do run_target "$target" down; done
