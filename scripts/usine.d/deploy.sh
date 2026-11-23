#!/usr/bin/env bash
# usine: Déploie l'image du commit courant dans l'environnement de test : usine deploy test [étiquette | image]
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=_registry.sh
source "$USINE_D/_registry.sh"

usage() {
  cat <<'EOF'
Usage : usine deploy test [étiquette | image:étiquette]

  Tire de ton registre l'image du commit courant et la lance dans app-test, à côté de la base db-test.
  Sans argument, l'image est ghcr.io/<propriétaire>/<dépôt>:<SHA complet du commit courant>,
  déduite du dépôt distant origin (USINE_REGISTRY_IMAGE pour en choisir une autre).
  Une étiquette seule (ex. v1.0.0) remplace le SHA ; une image complète (ex. reservations:local) est prise telle quelle.
EOF
}

case "${1:-}" in
  test) shift ;;
  -h | --help | help | "")
    usage
    [[ -n "${1:-}" ]] && exit 0
    exit 2
    ;;
  *) die "cible inconnue « $1 » : seule la cible « test » existe (usine deploy test)." ;;
esac
[[ $# -le 1 ]] || die "trop d'arguments. $(usage | head -n 1)"

COMPOSE_FILE="$USINE_ROOT/infra/compose.test.yaml"
WAIT_SECONDS="${USINE_DEPLOY_WAIT:-60}"

compose() {
  APP_TEST_IMAGE="${APP_TEST_IMAGE:-unused}" USINE_NETWORK="$USINE_NETWORK" docker compose -f "$COMPOSE_FILE" "$@"
}

# Échec du téléchargement : ce qu'il faut regarder.
pull() {
  registry_pull "$1" && return 0
  fail "Image introuvable ou inaccessible : $1"
  hint "$REGISTRY_ERROR"
  hint "Ton pipeline a-t-il publié ce commit ? Regarde « gh run list » et les paquets de ton dépôt sur GitHub."
  hint "Paquet privé : « gh auth refresh -s read:packages », puis relance « usine deploy test »."
  return 1
}

indent() { sed 's/^/      /'; }

# Interroge app-test depuis db-test (même réseau) : ne dépend ni du poste, ni du contenu de l'image de l'étudiant.
probe() {
  docker exec db-test wget -q -T 2 -O - "http://app-test:8080$1" 2>/dev/null
}

# --- Quelle image ? -------------------------------------------------------------------------------------------
arg="${1:-}"
if [[ "$arg" == */* || "$arg" == *:* ]]; then
  ref="$arg"
else
  tag="${arg:-$(git -C "$USINE_ROOT" rev-parse HEAD)}"
  registry_image || die "$REGISTRY_ERROR"
  ref="$REGISTRY_IMAGE:$tag"
fi

require_docker
title "Déploiement en test : $ref"

if is_remote "$ref"; then
  info "Téléchargement depuis le registre…"
  pull "$ref" || exit 1
  ok "Image téléchargée"
elif image_present "$ref"; then
  ok "Image locale"
else
  die "image locale introuvable : $ref (docker images pour la liste)."
fi

# On lance l'image par son condensat : ce qui tourne est exactement ce qui est dans le registre.
digest="$(registry_digest "$ref")"
export APP_TEST_IMAGE="${digest:-$ref}"
[[ -n "$digest" ]] && info "Condensat : ${digest#*@}"

# --- Lancement ------------------------------------------------------------------------------------------------
ensure_network "$USINE_NETWORK"
if ! out="$(compose up --detach --wait db-test 2>&1)"; then
  fail "La base de test db-test ne démarre pas."
  tail -n 5 <<<"$out" | indent
  docker logs --tail 10 db-test 2>&1 | indent || true
  exit 1
fi
ok "Base de test db-test prête"
if ! out="$(compose up --detach app-test 2>&1)"; then
  fail "app-test n'a pas pu être créé."
  tail -n 5 <<<"$out" | indent
  exit 1
fi

info "Attente de /ready (au plus $WAIT_SECONDS s)…"
deadline=$((SECONDS + WAIT_SECONDS))
until probe /ready >/dev/null; do
  if ((SECONDS >= deadline)); then
    fail "app-test ne devient pas prête en $WAIT_SECONDS s."
    hint "Dernières lignes de ses logs (docker logs app-test) :"
    docker logs --tail 10 app-test 2>&1 | indent || true
    exit 1
  fi
  sleep 1
done
ok "app-test est prête"
version="$(probe /version || true)"
info "/version : ${version:-?}"
echo
info "Depuis le devcontainer : curl http://app-test:8080/version"
info "Depuis le navigateur du poste : http://127.0.0.1:${USINE_TEST_PORT:-18080}/version"
