#!/usr/bin/env bash
# Aides communes aux tests autonomes des fournitures : chaque test démarre, vérifie, arrête et nettoie.
# À sourcer : source "$(dirname "$0")/_lib.sh"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC2034 # lue par les tests qui sourcent ce fichier
NODE_IMAGE="$(grep -E '^node:24' "$ROOT/infra/images.txt" | head -n 1)"
PASSED=0
FAILED=0

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  _g=$'\033[32m' _r=$'\033[31m' _b=$'\033[1m' _o=$'\033[0m'
else
  _g='' _r='' _b='' _o=''
fi

section() { printf '\n%s%s%s\n' "$_b" "$*" "$_o"; }
pass() {
  PASSED=$((PASSED + 1))
  printf '  %s✓%s %s\n' "$_g" "$_o" "$*"
}
miss() {
  FAILED=$((FAILED + 1))
  printf '  %s✗%s %s\n' "$_r" "$_o" "$*"
}
# check "libellé" commande… : réussit si la commande réussit.
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$label"; else miss "$label"; fi
}
# expect "libellé" attendu constaté
expect() {
  if [[ "$2" == "$3" ]]; then pass "$1"; else miss "$1 — attendu : « $2 », constaté : « $3 »"; fi
}
# expect_match "libellé" motif-grep texte
expect_match() {
  if grep -qE -- "$2" <<<"$3"; then pass "$1"; else miss "$1 — attendu : /$2/, constaté : « ${3:0:300} »"; fi
}

# Attend qu'une commande réussisse (au plus $2 secondes).
wait_for() {
  local seconds="$1"
  shift
  local deadline=$((SECONDS + seconds))
  until "$@" >/dev/null 2>&1; do
    ((SECONDS < deadline)) || return 1
    sleep 0.5
  done
}

finish() {
  echo
  if ((FAILED > 0)); then
    printf '%s%d vérification(s) en échec%s, %d réussie(s).\n' "$_r" "$FAILED" "$_o" "$PASSED"
    exit 1
  fi
  printf '%sToutes les vérifications passent%s (%d).\n' "$_g" "$_o" "$PASSED"
}

# Construit l'image de l'application. build_app <nom:étiquette> <version> <commit>
build_app() {
  docker build --quiet --build-arg "APP_VERSION=$2" --build-arg "APP_COMMIT=$3" -t "$1" "$ROOT/app" >/dev/null
}
