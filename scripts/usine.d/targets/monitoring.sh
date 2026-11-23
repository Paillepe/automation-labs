#!/usr/bin/env bash
# Cible « monitoring » : la stack du lab monitoring, dans le cluster (flux Fournitures). Voir _monitoring.sh.
# « usine up monitoring » démarre le cluster s'il le faut, et relit project/monitoring/ à chaque appel.
# shellcheck source=../_cluster.sh
source "$USINE_D/_cluster.sh"
# shellcheck source=../_monitoring.sh
source "$USINE_D/_monitoring.sh"

target_up() { monitoring_up; }
target_down() { monitoring_down; }
target_status() { monitoring_status; }
