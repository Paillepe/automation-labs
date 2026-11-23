#!/usr/bin/env bash
# usine: Démarre une cible et attend qu'elle soit saine : usine up servers | infra | cluster | monitoring
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"

if [[ $# -eq 0 || "$1" == -h || "$1" == --help ]]; then
  echo "Usage : usine up <cible…>   (cibles : $(list_targets | tr '\n' ' '))"
  [[ $# -eq 0 ]] && exit 2 || exit 0
fi
require_docker
for target in "$@"; do
  title "Démarrage : $target"
  run_target up "$target"
done
