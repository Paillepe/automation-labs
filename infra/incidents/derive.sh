#!/usr/bin/env bash
# Incident du lab terraform : une dérive. Quelqu'un a « dépanné » l'infrastructure à la main, hors du code :
# srv-web-2 est arrêté, et le conteneur db a été supprimé. « terraform plan » le voit (~ srv-web-2 à modifier sur
# place, + db à créer), « terraform apply » remet la réalité d'accord avec le code.
# Le provider Docker (kreuzwerker/docker 4.7.0) ne voit PAS un réseau ajouté ou retiré à la main : une dérive de
# réseau serait invisible au plan. D'où ce choix, vérifié par infra/tests/incidents.sh.
#   usine incident derive          provoque la dérive (idempotent)
#   usine incident derive clear    rien à faire : le remède, c'est terraform apply
# Réglages (essais) : USINE_DERIVE_WEB (srv-web-2), USINE_DERIVE_DB (db).
set -euo pipefail
# shellcheck source=../../scripts/usine.d/_lib.sh
source "$USINE_D/_lib.sh"

WEB="${USINE_DERIVE_WEB:-srv-web-2}"
DB="${USINE_DERIVE_DB:-db}"

if [[ "${1:-inject}" == clear ]]; then
  info "Rien à retirer à la main : c'est « terraform apply » (lab terraform) qui remet l'infrastructure d'accord avec le code."
  exit 0
fi

require_docker
docker container inspect "$WEB" >/dev/null 2>&1 \
  || die "le conteneur « $WEB » n'existe pas : l'infrastructure du lab terraform n'est pas déployée (terraform apply)."

if [[ "$(docker inspect "$WEB" --format '{{.State.Running}}')" == true ]]; then
  docker stop "$WEB" >/dev/null || die "impossible d'arrêter $WEB."
fi
if docker container inspect "$DB" >/dev/null 2>&1; then
  docker rm -f "$DB" >/dev/null || die "impossible de supprimer $DB."
fi

echo
echo "$(date '+%H:%M') — Message de Kévin, de l'astreinte, posté vendredi soir dans le canal de l'équipe :"
echo "  « $WEB consommait de la mémoire pour rien, je l'ai arrêté. J'ai aussi supprimé le conteneur $DB,"
echo "    je pensais que c'était un reste de test. Je vous laisse vérifier lundi. Bon week-end ! »"
