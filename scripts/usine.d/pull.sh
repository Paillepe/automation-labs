#!/usr/bin/env bash
# usine: Télécharge toutes les images des 4 jours (à lancer chez soi, avant le cours)
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"

require_docker

mapfile -t images < <(list_images)
total="${#images[@]}"
if [[ "$total" -eq 0 ]]; then
  echo "Aucune image listée dans infra/images.txt : rien à télécharger."
  exit 0
fi

echo "Téléchargement de $total image(s). Compte quelques minutes selon ta connexion."
missing=()
n=0
for image in "${images[@]}"; do
  n=$((n + 1))
  short="${image%%@*}"
  if image_present "$image"; then
    ok "[$n/$total] $short (déjà là)"
    continue
  fi
  info "[$n/$total] $short …"
  pulled=0
  for attempt in 1 2 3; do
    if docker pull --quiet "$image" >/dev/null 2>"${TMPDIR:-/tmp}/usine-pull.err"; then
      pulled=1
      break
    fi
    sleep $((attempt * 2))
  done
  if [[ "$pulled" -eq 1 ]]; then
    ok "[$n/$total] $short"
  else
    fail "[$n/$total] $short"
    hint "$(tail -n 1 "${TMPDIR:-/tmp}/usine-pull.err")"
    missing+=("$short")
  fi
done

echo
if [[ "${#missing[@]}" -gt 0 ]]; then
  echo "${#missing[@]} image(s) n'ont pas pu être téléchargées :"
  printf '  - %s\n' "${missing[@]}"
  echo
  echo "Vérifie ta connexion et relance « usine pull » : seules les images manquantes sont reprises."
  echo "Si le message parle de « toomanyrequests », le Docker Hub limite les téléchargements anonymes :"
  echo "attends une heure, ou connecte-toi avec « docker login »."
  exit 1
fi
echo "Toutes les images sont là. Vérifie ton poste avec « usine doctor »."
