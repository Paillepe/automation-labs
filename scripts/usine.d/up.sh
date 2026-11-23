#!/usr/bin/env bash
# usine: Démarre une ou plusieurs cibles et attend qu'elles soient saines : usine up <cible…>
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=_targets.sh
source "$USINE_D/_targets.sh"

[[ $# -gt 0 ]] || die "précise une cible : usine up <cible…> (cibles : $(target_names))."
for target in "$@"; do require_target "$target"; done
for target in "$@"; do run_target "$target" up; done
