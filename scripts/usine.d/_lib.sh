#!/usr/bin/env bash
# Fonctions communes aux commandes de usine. À sourcer : source "$USINE_D/_lib.sh"
# Ce fichier appartient au flux Chaîne ; les commandes des deux flux le sourcent sans le modifier.

USINE_ROOT="${USINE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
USINE_D="${USINE_D:-$USINE_ROOT/scripts/usine.d}"

# Réseau Docker commun : serveurs, cluster k3d, monitoring et devcontainer s'y retrouvent par leur nom.
USINE_NETWORK="${USINE_NETWORK:-usine}"
USINE_IMAGES_FILE="${USINE_IMAGES_FILE:-$USINE_ROOT/infra/images.txt}"

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  _c_ok=$'\033[32m' _c_warn=$'\033[33m' _c_fail=$'\033[31m' _c_dim=$'\033[2m' _c_bold=$'\033[1m' _c_off=$'\033[0m'
else
  _c_ok='' _c_warn='' _c_fail='' _c_dim='' _c_bold='' _c_off=''
fi

title() { printf '\n%s%s%s\n' "$_c_bold" "$*" "$_c_off"; }
info() { printf '  %s\n' "$*"; }
ok() { printf '  %s✓%s %s\n' "$_c_ok" "$_c_off" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$_c_warn" "$_c_off" "$*"; }
fail() { printf '  %s✗%s %s\n' "$_c_fail" "$_c_off" "$*"; }
hint() { printf '      %s→ %s%s\n' "$_c_dim" "$*" "$_c_off"; }
die() {
  printf '%susine :%s %s\n' "$_c_fail" "$_c_off" "$*" >&2
  exit 1
}

# Le démon Docker répond-il ?
docker_ok() { docker info >/dev/null 2>&1; }

require_docker() {
  docker_ok || die "Docker ne répond pas. Lance Docker Desktop (ou le service docker), puis recommence."
}

# Liste les images de infra/images.txt : une référence par ligne, commentaires (#) et lignes vides ignorés.
list_images() {
  [[ -f "$USINE_IMAGES_FILE" ]] || return 0
  sed -e 's/[[:space:]]*#.*$//' -e 's/^[[:space:]]*//' -e '/^$/d' "$USINE_IMAGES_FILE"
}

# L'image est-elle déjà sur le poste ?
image_present() { docker image inspect "$1" >/dev/null 2>&1; }

# Identifiant du conteneur dans lequel on tourne (le devcontainer), vide si on est sur l'hôte.
# Lu dans mountinfo, car sur Codespaces le hostname n'est pas l'identifiant ; à défaut, le hostname.
self_container() {
  local id
  [[ -f /.dockerenv ]] || return 0
  id="$(grep -o 'containers/[0-9a-f]\{64\}' /proc/self/mountinfo 2>/dev/null | head -n 1 || true)"
  id="${id#containers/}"
  docker container inspect "${id:-$(hostname)}" --format '{{.Id}}' 2>/dev/null || true
}

# Crée un réseau Docker s'il manque (celui de l'usine par défaut), et y rattache le devcontainer. Idempotent.
ensure_network() {
  local network="${1:-$USINE_NETWORK}"
  docker network inspect "$network" >/dev/null 2>&1 || docker network create "$network" >/dev/null
  attach_self "$network"
}

# Rattache le devcontainer à un réseau existant, pour joindre ses conteneurs par leur nom. Idempotent.
attach_self() {
  local network="${1:-$USINE_NETWORK}" self
  self="$(self_container)"
  [[ -n "$self" ]] || return 0
  docker network inspect "$network" >/dev/null 2>&1 || return 0
  # Sur Codespaces, le devcontainer partage le réseau de la machine (mode host) : il ne peut rejoindre aucun
  # réseau, mais il joint chaque conteneur par son adresse. On écrit donc les noms dans /etc/hosts.
  if [[ "$(docker inspect "$self" --format '{{.HostConfig.NetworkMode}}')" == host ]]; then
    hosts_fallback "$network"
    return 0
  fi
  if ! docker inspect "$self" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' | grep -qw -- "$network"; then
    docker network connect "$network" "$self"
  fi
}

# Écrit dans /etc/hosts « adresse nom » pour chaque conteneur du réseau, dans un bloc repéré par « # usine:<réseau> »,
# réécrit à chaque appel (les adresses changent à chaque démarrage). Le reste du fichier ne bouge pas.
hosts_fallback() {
  local network="$1" file="${USINE_HOSTS_FILE:-/etc/hosts}" mark lines content
  mark=" # usine:$network"
  lines="$(docker network inspect "$network" \
    --format '{{range .Containers}}{{.IPv4Address}} {{.Name}}{{"\n"}}{{end}}' | sed -e 's#/[0-9]* # #' -e '/^$/d')"
  content="$(grep -vF -- "$mark" "$file" || true)"
  # shellcheck disable=SC2001 # une substitution par ligne : sed est ici plus lisible qu'un développement Bash
  [[ -z "$lines" ]] || content+=$'\n'"$(sed -e "s|\$|$mark|" <<<"$lines")"
  [[ "$content" == "$(cat "$file")" ]] && return 0
  # /etc/hosts est monté dans le conteneur : on le réécrit en place, jamais par remplacement.
  if [[ -w "$file" ]]; then
    printf '%s\n' "$content" >"$file"
  else
    printf '%s\n' "$content" | sudo -n tee "$file" >/dev/null \
      || die "devcontainer en réseau host : impossible d'écrire dans $file (sudo refusé)"
  fi
}

# Installe la clé de lab dans ~/.ssh/usine_lab avec les droits 0600 qu'exige ssh. Idempotent.
ensure_lab_key() {
  local src="$USINE_ROOT/infra/keys/lab_ed25519" dst="$HOME/.ssh/usine_lab"
  [[ -f "$src" ]] || return 0
  mkdir -p "$HOME/.ssh" && chmod 0700 "$HOME/.ssh"
  cmp -s "$src" "$dst" 2>/dev/null || install -m 0600 "$src" "$dst"
}

# État d'un conteneur (running, exited…), ou « absent ».
container_state() {
  local state
  state="$(docker container inspect "$1" --format '{{.State.Status}}' 2>/dev/null || true)"
  echo "${state:-absent}"
}

# --- SSH vers les serveurs du cours ----------------------------------------------------------------------------
# Options communes : clé de lab, pas de vérification d'empreinte (les serveurs sont recréés à chaque rebuild).
USINE_SSH_OPTS=(-i "$HOME/.ssh/usine_lab" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
  -o LogLevel=ERROR -o BatchMode=yes -o ConnectTimeout=3)

lab_ssh() {
  local host="$1"
  shift
  # shellcheck disable=SC2029 # la commande s'exécute sur le serveur : c'est voulu
  ssh "${USINE_SSH_OPTS[@]}" "deploy@$host" "$@"
}

# Attend qu'un serveur accepte la clé de lab en SSH (au plus $2 secondes, 30 par défaut).
wait_ssh() {
  local host="$1" limit="${2:-30}" deadline
  deadline=$((SECONDS + limit))
  until lab_ssh "$host" true 2>/dev/null; do
    ((SECONDS < deadline)) || return 1
    sleep 1
  done
}
