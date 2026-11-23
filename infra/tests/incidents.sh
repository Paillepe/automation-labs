#!/usr/bin/env bash
# Test autonome de « usine incident » (mécanique de l'épreuve) et de l'incident de lab « derive ».
# À lancer dans le devcontainer. Sans cluster. L'incident « erreurs » est testé par infra/tests/monitoring.sh.
#   1. Mécanique : une fausse épreuve, dans un dossier temporaire (USINE_INCIDENTS_DIR), note chacun de ses appels.
#      Vérifie : état noté dans .usine/incident, graine stable, resume rejoue avec la même graine, clear clôt.
#   2. derive : une petite infrastructure Terraform (noms préfixés usine-t-, comme celle du lab terraform) ;
#      la dérive (serveur arrêté, base supprimée) est vue par « terraform plan », réparée par « terraform apply ».
# Nettoie derrière lui ; une épreuve réellement en cours sur le poste est mise de côté puis remise.
# shellcheck disable=SC2015 # « commande && pass … || miss … » : pass rend toujours 0
set -euo pipefail
source "$(dirname "$0")/_lib.sh"

usine() { "$ROOT/scripts/usine" "$@"; }
FAKE="$(mktemp -d)"
TF="$(mktemp -d)"
STATE="$ROOT/.usine/incident"
SAVED=""
[[ -f "$STATE" ]] && SAVED="$(cat "$STATE")" && rm -f "$STATE"
cleanup() {
  rm -f "$STATE"
  [[ -z "$SAVED" ]] || printf '%s\n' "$SAVED" >"$STATE"
  (cd "$TF" && terraform destroy -input=false -auto-approve >/dev/null 2>&1) || true
  rm -rf "$FAKE" "$TF"
}
trap cleanup EXIT

section "usine incident : erreurs d'usage"
set +e
out="$(usine incident inconnu 2>&1)"
rc=$?
set -e
expect "incident inconnu : code 1" 1 "$rc"
expect_match "les incidents de lab sont listés" "derive.*erreurs|erreurs.*derive" "$out"
set +e
out="$(usine incident epreuve 2>&1)"
rc=$?
set -e
expect "épreuve pas encore distribuée : code 1" 1 "$rc"
expect_match "message : elle arrive par lab update" "npx lab update" "$out"
expect_match "status : aucune épreuve" "Aucune épreuve" "$(usine incident status)"
usine incident resume >/dev/null && pass "resume sans épreuve en cours : ne fait rien (code 0)" || miss "resume sans épreuve en cours (code 0)"

section "Mécanique de l'épreuve (fausse épreuve)"
cat >"$FAKE/essai.sh" <<'EOF'
#!/usr/bin/env bash
echo "$1 $USINE_INCIDENT_SEED" >>"$(dirname "$0")/appels"
echo "Message de l'essai"
EOF
export USINE_INCIDENTS_DIR="$FAKE"
out="$(USINE_SEED=42 usine incident essai 2>&1)" && pass "usine incident essai (code 0)" || miss "usine incident essai (code 0)"
expect_match "le message de l'incident est affiché" "Message de l'essai" "$out"
expect "état noté dans .usine/incident" "NAME=essai SEED=42" "$(grep -E '^(NAME|SEED)=' "$STATE" | tr '\n' ' ' | sed 's/ $//')"
expect_match "status : épreuve en cours" "Épreuve en cours : essai" "$(usine incident status)"
USINE_SEED=7 usine incident essai >/dev/null
expect "relancée, elle garde sa graine" "inject 42" "$(tail -n 1 "$FAKE/appels")"
usine incident resume >/dev/null && pass "usine incident resume (code 0)" || miss "usine incident resume (code 0)"
expect "resume rejoue le script avec la même graine" "resume 42" "$(tail -n 1 "$FAKE/appels")"
usine incident reinject >/dev/null
expect "reinject est un alias de resume" "resume 42" "$(tail -n 1 "$FAKE/appels")"
cat >"$FAKE/autre.sh" <<'EOF'
#!/usr/bin/env bash
true
EOF
set +e
out="$(usine incident autre 2>&1)"
rc=$?
set -e
expect "une seconde épreuve est refusée : code 1" 1 "$rc"
expect_match "message : clore la première" "usine incident clear" "$out"
usine incident clear >/dev/null && pass "usine incident clear (code 0)" || miss "usine incident clear (code 0)"
expect "clear appelle le script" "clear 42" "$(tail -n 1 "$FAKE/appels")"
expect "plus d'état" absent "$([[ -f "$STATE" ]] && echo present || echo absent)"
n="$(wc -l <"$FAKE/appels")"
usine incident resume >/dev/null
expect "après clear, resume ne fait plus rien" "$n" "$(wc -l <"$FAKE/appels")"
seed1="$(USINE_SEED='' bash -c "source '$ROOT/scripts/usine.d/_lib.sh'; cd '$ROOT'; git remote get-url origin 2>/dev/null || hostname" | tr '[:upper:]' '[:lower:]' | tr -d '\n' | cksum | cut -d' ' -f1)"
usine incident essai >/dev/null
expect "sans USINE_SEED, la graine vient du dépôt origin" "inject $seed1" "$(tail -n 1 "$FAKE/appels")"
usine incident clear >/dev/null
unset USINE_INCIDENTS_DIR

section "derive : la dérive se voit dans terraform plan, terraform apply la répare"
debian="$(grep '^debian:' "$ROOT/infra/images.txt" | head -n 1)"
cat >"$TF/main.tf" <<EOF
terraform {
  required_providers {
    docker = { source = "kreuzwerker/docker", version = "4.7.0" }
  }
}
provider "docker" {}
resource "docker_network" "front" { name = "usine-t-front" }
resource "docker_network" "back" { name = "usine-t-back" }
resource "docker_image" "debian" {
  name         = "$debian"
  keep_locally = true
}
resource "docker_container" "web" {
  name    = "usine-t-web"
  image   = docker_image.debian.image_id
  command = ["sleep", "infinity"]
  networks_advanced { name = docker_network.front.name }
  networks_advanced { name = docker_network.back.name }
}
resource "docker_container" "db" {
  name    = "usine-t-db"
  image   = docker_image.debian.image_id
  command = ["sleep", "infinity"]
  networks_advanced { name = docker_network.back.name }
}
EOF
(cd "$TF" && terraform init -input=false >/dev/null && terraform apply -input=false -auto-approve >/dev/null) && pass "infrastructure créée" || miss "infrastructure créée"
plan() { (cd "$TF" && terraform plan -input=false -no-color -detailed-exitcode >"$TF/plan.txt" 2>&1); }
networks_of() { docker inspect "$1" --format '{{range $n, $_ := .NetworkSettings.Networks}}{{$n}} {{end}}' 2>/dev/null | xargs -n1 | sort | xargs; }
set +e
plan
rc=$?
set -e
expect "avant : plan sans différence (code 0)" 0 "$rc"
derive() { USINE_DERIVE_WEB=usine-t-web USINE_DERIVE_DB=usine-t-db usine incident derive 2>&1; }
out="$(derive)" && pass "usine incident derive (code 0)" || miss "usine incident derive — $out"
expect_match "message réaliste" "je l'ai arrêté" "$out"
expect "le serveur web est arrêté" false "$(docker inspect usine-t-web --format '{{.State.Running}}')"
expect "la base a disparu" absente "$(docker container inspect usine-t-db >/dev/null 2>&1 && echo presente || echo absente)"
derive >/dev/null && pass "relancé : idempotent (code 0)" || miss "relancé : idempotent (code 0)"
set +e
plan
rc=$?
set -e
expect "terraform plan voit la dérive (code 2)" 2 "$rc"
expect_match "le plan : la base à créer" "docker_container.db will be created" "$(cat "$TF/plan.txt")"
expect_match "le plan : le serveur web à modifier sur place" "docker_container.web will be updated in-place" "$(cat "$TF/plan.txt")"
(cd "$TF" && terraform apply -input=false -auto-approve >/dev/null 2>&1) && pass "terraform apply (code 0)" || miss "terraform apply (code 0)"
expect "après apply : le serveur web tourne" true "$(docker inspect usine-t-web --format '{{.State.Running}}')"
expect "après apply : il est toujours sur front et back" "usine-t-back usine-t-front" "$(networks_of usine-t-web)"
expect "après apply : la base est revenue, sur back seulement" "usine-t-back" "$(networks_of usine-t-db)"
set +e
plan
rc=$?
set -e
expect "après apply : plan sans différence (code 0)" 0 "$rc"
set +e
out="$(USINE_DERIVE_WEB=usine-t-absent usine incident derive 2>&1)"
rc=$?
set -e
expect "infrastructure absente : code 1" 1 "$rc"
expect_match "message : terraform apply" "terraform apply" "$out"

finish
