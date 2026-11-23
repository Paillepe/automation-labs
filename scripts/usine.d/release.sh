#!/usr/bin/env bash
# usine: Charge dans le cluster l'image d'une version, sous le nom reservations:<version> : usine release <version>
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=_registry.sh
source "$USINE_D/_registry.sh"
# shellcheck source=_cluster.sh
source "$USINE_D/_cluster.sh"

RELEASE_NAME="${USINE_RELEASE_NAME:-reservations}"

usage() {
  cat <<EOF
Usage : usine release <version> [--local]
        usine release            (chaque version citée par les manifests de project/k8s/)

  Rend l'image de cette version disponible dans le cluster, sous le nom fixe $RELEASE_NAME:<version> :
  c'est ce nom que citent tes manifests (image: $RELEASE_NAME:1.0.0).
  L'image est tirée de ton registre (ghcr.io/<propriétaire>/<dépôt>:<version>, ou :v<version>), celle que ton
  pipeline a publiée au tag Git v<version>. À défaut (pas d'image, pas de réseau, pas de fork), elle est
  construite en local à partir de app/, et la commande le dit. --local force la construction locale.
EOF
}

# Versions citées par les manifests de l'étudiant : image: reservations:<version>.
manifest_versions() {
  local dir="$USINE_ROOT/project/k8s"
  [[ -d "$dir" ]] || return 0
  grep -rhoE "image:[[:space:]]*[\"']?$RELEASE_NAME:[A-Za-z0-9._-]+" "$dir" 2>/dev/null \
    | sed -E "s/.*$RELEASE_NAME://" | sort -u || true
}

# Commit de la version : celui du tag Git v<version> s'il existe, sinon celui de HEAD.
version_commit() {
  git -C "$USINE_ROOT" rev-parse --verify --quiet "refs/tags/v$1^{commit}" 2>/dev/null \
    || git -C "$USINE_ROOT" rev-parse HEAD
}

build_local() {
  local version="$1" target="$2" commit out
  commit="$(version_commit "$version")"
  info "Construction locale de $target (app/, commit ${commit:0:12})…"
  if ! out="$(docker build --quiet --build-arg "APP_VERSION=$version" --build-arg "APP_COMMIT=$commit" \
    -t "$target" "$USINE_ROOT/app" 2>&1)"; then
    tail -n 8 <<<"$out" | sed 's/^/      /'
    die "la construction locale de l'image a échoué."
  fi
  SOURCE=local REF="$target" DIGEST="" COMMIT="$commit"
}

release_one() {
  local version="${1#v}" mode="$2" target reason="" candidate
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+.][0-9A-Za-z.-]+)?$ ]] \
    || die "version invalide « $1 » : attendu une version comme 1.0.0 (le tag Git est v1.0.0)."
  target="$RELEASE_NAME:$version"
  title "Version $version → $target"

  # Version fournie par un incident en cours (.usine/provided/<version>) : elle ne se remplace pas.
  if [[ -f "$USINE_STATE/provided/$version" ]]; then
    image_present "$target" || die "la version $version fournie par l'incident en cours est absente du poste : relance l'incident (usine incident status)."
    ok "Version fournie par l'équipe de développement : elle n'est ni tirée ni reconstruite."
    SOURCE=provided REF="$target" DIGEST="" COMMIT=""
  else
    if [[ "$mode" == local ]]; then
      reason="construction locale demandée (--local)"
    elif [[ "${USINE_REPLAY:-}" == 1 ]]; then
      reason="rejeu : pas de registre"
    elif ! registry_image; then
      reason="$REGISTRY_ERROR"
    else
      for candidate in "$REGISTRY_IMAGE:$version" "$REGISTRY_IMAGE:v$version"; do
        info "Téléchargement de $candidate…"
        if registry_pull "$candidate"; then
          SOURCE=registry REF="$candidate" DIGEST="$(registry_digest "$candidate")"
          COMMIT="$(docker image inspect "$candidate" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^APP_COMMIT=//p')"
          break
        fi
        reason="$REGISTRY_ERROR"
      done
    fi
    if [[ "${SOURCE:-}" == registry ]]; then
      docker tag "$REF" "$target"
      ok "Image de ton registre : $REF"
      [[ -z "$DIGEST" ]] || info "Condensat : ${DIGEST#*@}"
    else
      warn "Image absente de ton registre ou registre injoignable : ${reason:-raison inconnue}"
      hint "Repli : l'image est construite sur ce poste. Ce n'est pas celle qu'a publiée ton pipeline."
      build_local "$version" "$target"
      ok "Image construite en local : $target"
    fi
  fi

  cluster_import "$target"
  mkdir -p "$USINE_STATE/releases"
  printf 'SOURCE=%s\nREF=%s\nDIGEST=%s\nCOMMIT=%s\nIMAGE_ID=%s\n' "$SOURCE" "$REF" "$DIGEST" "$COMMIT" \
    "$(docker image inspect "$target" --format '{{.Id}}')" >"$USINE_STATE/releases/$version"

  # Des pods tournent déjà sous ce nom, avec une autre image : ils ne la reprennent qu'en redémarrant.
  local stale
  stale="$(kubectl get pods -A -o json 2>/dev/null | jq -r --arg img "$(containerd_name "$target")" --arg id "$(docker image inspect "$target" --format '{{.Id}}')" \
    '.items[] | select(any(.status.containerStatuses[]?; .image == $img and .imageID != "" and (.imageID | endswith($id | sub("^sha256:"; ""))) == false)) | "\(.metadata.namespace)/\(.metadata.name)"' 2>/dev/null || true)"
  if [[ -n "$stale" ]]; then
    warn "Des pods tournent encore avec l'ancienne image $target : $(tr '\n' ' ' <<<"$stale")"
    hint "Ils la reprendront à leur prochain redémarrage (kubectl rollout restart deployment/<nom>)."
  fi
  info "Dans tes manifests : image: $target"
  unset SOURCE REF DIGEST COMMIT
}

mode=registry
versions=()
for arg in "$@"; do
  case "$arg" in
    -h | --help | help)
      usage
      exit 0
      ;;
    --local) mode=local ;;
    -*) die "option inconnue « $arg ». $(usage | head -n 1)" ;;
    *) versions+=("$arg") ;;
  esac
done
if [[ "${#versions[@]}" -eq 0 ]]; then
  mapfile -t versions < <(manifest_versions)
  if [[ "${#versions[@]}" -eq 0 ]]; then
    usage >&2
    exit 2
  fi
  info "Versions citées par project/k8s/ : ${versions[*]}"
fi

require_docker
require_cluster
for version in "${versions[@]}"; do release_one "$version" "$mode"; done
