#!/usr/bin/env bash
# Cibles de « usine up » et « usine down » : une cible par fichier, scripts/usine.d/targets/<cible>.sh.
# À sourcer après _lib.sh : source "$USINE_D/_targets.sh"
#
# Contrat d'une cible (même règles que les commandes, voir LISEZMOI.md) : le fichier définit les fonctions
# target_up, target_down et target_status, idempotentes. Il est sourcé dans un sous-shell, une cible à la fois :
# les noms ne se mélangent pas. Ajouter une cible, c'est ajouter un fichier ; personne n'édite celui d'un autre flux.
# Ordre de « usine down » sans argument : ordre alphabétique des fichiers. Une cible dont le support a déjà disparu
# (monitoring sans cluster) ne fait rien.

target_names() {
  local file names=()
  for file in "$USINE_D"/targets/*.sh; do
    [[ -f "$file" ]] && names+=("$(basename "$file" .sh)")
  done
  echo "${names[*]}"
}

require_target() {
  [[ "$1" =~ ^[a-z][a-z0-9-]*$ && -f "$USINE_D/targets/$1.sh" ]] \
    || die "cible inconnue « $1 » (cibles : $(target_names))."
}

# run_target <cible> <up|down|status>
run_target() {
  (
    # shellcheck source=/dev/null
    source "$USINE_D/targets/$1.sh"
    "target_$2"
  )
}
