#!/usr/bin/env bash
# Registre de l'étudiant (ghcr.io) : partagé par « usine deploy test » et « usine release » (flux Fournitures).
# À sourcer après _lib.sh : source "$USINE_D/_registry.sh"
# shellcheck disable=SC2034 # REGISTRY_IMAGE et REGISTRY_ERROR sont lus par les commandes qui sourcent ce fichier

# Pose REGISTRY_IMAGE = ghcr.io/<propriétaire>/<dépôt>, en minuscules, d'après origin (USINE_REGISTRY_IMAGE l'emporte).
# Rend 1, avec un message dans REGISTRY_ERROR, si origin manque ou ne vise pas GitHub.
# S'appelle hors de $(…) : registry_image || die "$REGISTRY_ERROR"
registry_image() {
  REGISTRY_ERROR=""
  REGISTRY_IMAGE=""
  if [[ -n "${USINE_REGISTRY_IMAGE:-}" ]]; then
    REGISTRY_IMAGE="$USINE_REGISTRY_IMAGE"
    return 0
  fi
  local url path
  if ! url="$(git -C "$USINE_ROOT" remote get-url origin 2>/dev/null)"; then
    REGISTRY_ERROR="aucun dépôt distant « origin » : ton fork n'est pas configuré (lab demarrage)."
    return 1
  fi
  path="$(sed -E -e 's#^(git@github\.com:|ssh://git@github\.com/|https://([^@/]+@)?github\.com/)##' -e 's#\.git$##' -e 's#/$##' <<<"$url")"
  if [[ ! "$path" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    REGISTRY_ERROR="origin ne pointe pas vers un dépôt GitHub ($url) : impossible de deviner ton registre."
    return 1
  fi
  REGISTRY_IMAGE="ghcr.io/${path,,}"
}

# Une référence vise-t-elle un registre (premier segment avec un point, deux-points, ou localhost) ?
is_remote() {
  local first="${1%%/*}"
  [[ "$1" == */* && ("$first" == *.* || "$first" == *:* || "$first" == localhost) ]]
}

# Tire une image. Paquet privé sur ghcr.io : réessaie avec le jeton de gh, s'il est connecté.
# Ne dit rien ; en cas d'échec, rend 1 et laisse la dernière ligne d'erreur de Docker dans REGISTRY_ERROR.
registry_pull() {
  local ref="$1" err
  REGISTRY_ERROR=""
  err="$(mktemp)"
  if docker pull --quiet "$ref" >/dev/null 2>"$err"; then
    rm -f "$err"
    return 0
  fi
  if [[ "$ref" == ghcr.io/* ]] && grep -qiE 'denied|unauthorized|authentication' "$err" && gh auth status >/dev/null 2>&1; then
    info "Accès refusé sans authentification : connexion à ghcr.io avec le jeton de gh."
    if gh auth token | docker login ghcr.io -u "$(gh api user --jq .login)" --password-stdin >/dev/null 2>&1 \
      && docker pull --quiet "$ref" >/dev/null 2>"$err"; then
      rm -f "$err"
      return 0
    fi
  fi
  REGISTRY_ERROR="$(tail -n 1 "$err")"
  rm -f "$err"
  return 1
}

# Condensat de registre d'une image tirée (repo@sha256:…), vide pour une image construite en local.
registry_digest() {
  local ref="$1" repo
  repo="${ref%@*}"
  repo="${repo%:*}"
  docker image inspect "$ref" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null | grep -F "$repo@" | head -n 1 || true
}
