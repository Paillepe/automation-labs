#!/usr/bin/env bash
# usine: Rattache le devcontainer au réseau de l'usine, s'il existe (automatique au démarrage)
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"

# Appelée par postStartCommand : ne doit jamais empêcher le devcontainer de démarrer.
docker_ok || exit 0
attach_self || true
ensure_lab_key || true
