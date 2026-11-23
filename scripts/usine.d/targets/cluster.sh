#!/usr/bin/env bash
# Cible « cluster » : k3d, images importées, base de données (flux Fournitures). Voir _cluster.sh.
# shellcheck source=../_cluster.sh
source "$USINE_D/_cluster.sh"

target_up() { cluster_up; }
target_down() { cluster_down; }
target_status() { cluster_status; }
