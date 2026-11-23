# Cible « infra » : ce que décrit le Terraform de l'étudiant (project/infra/) — réseaux front et back, srv-web-*, db.
# « usine up infra » joue terraform apply ; « usine down infra » détruit et nettoie ce qui resterait d'un autre state.
# shellcheck shell=bash

INFRA_DIR="$USINE_ROOT/project/infra"
INFRA_NETWORKS=(front back)

infra_tf() {
  TF_IN_AUTOMATION=1 terraform -chdir="$INFRA_DIR" "$@"
}

# Le Terraform de l'étudiant décrit-il des conteneurs ?
infra_declared() {
  compgen -G "$INFRA_DIR/*.tf" >/dev/null && grep -qsE '^[[:space:]]*resource[[:space:]]+"docker_container"' "$INFRA_DIR"/*.tf
}

target_up() {
  require_docker
  infra_declared || {
    warn "project/infra/ ne décrit encore aucun conteneur : rien à créer"
    return 0
  }
  info "terraform init…"
  local out
  if ! out="$(infra_tf init -input=false 2>&1)"; then
    fail "terraform init échoue."
    tail -n 8 <<<"$out" | sed 's/^/      /'
    return 1
  fi
  info "terraform apply…"
  if ! out="$(infra_tf apply -input=false -auto-approve 2>&1)"; then
    fail "terraform apply échoue."
    tail -n 12 <<<"$out" | sed 's/^/      /'
    return 1
  fi
  ok "$(grep -E '^Apply complete' <<<"$out" || echo 'terraform apply terminé')"
  local net
  for net in "${INFRA_NETWORKS[@]}"; do attach_self "$net"; done
  ensure_lab_key
}

target_down() {
  local self net names
  self="$(self_container)"
  if [[ -f "$INFRA_DIR/terraform.tfstate" ]] && infra_tf state list >/dev/null 2>&1; then
    infra_tf destroy -input=false -auto-approve >/dev/null 2>&1 || warn "terraform destroy a échoué : nettoyage par les noms"
  fi
  # Ce qui resterait d'un autre state (un autre clone, un rejeu) : les conteneurs des réseaux front et back.
  for net in "${INFRA_NETWORKS[@]}"; do
    docker network inspect "$net" >/dev/null 2>&1 || continue
    [[ -z "$self" ]] || docker network disconnect -f "$net" "$self" >/dev/null 2>&1 || true
    names="$(docker network inspect "$net" --format '{{range .Containers}}{{.Name}} {{end}}')"
    # shellcheck disable=SC2086 # une liste de noms
    [[ -z "${names// /}" ]] || docker rm -f $names >/dev/null 2>&1 || true
    docker network rm "$net" >/dev/null 2>&1 || true
  done
  names="$(docker ps -aq --filter 'name=^srv-web-')"
  # shellcheck disable=SC2086
  [[ -z "$names" ]] || docker rm -f $names >/dev/null 2>&1 || true
  rm -f "$INFRA_DIR"/terraform.tfstate "$INFRA_DIR"/terraform.tfstate.backup
  ok "infrastructure Terraform supprimée (state compris)"
}

target_status() {
  local names
  names="$(docker ps -a --filter 'name=^srv-web-' --filter 'name=^db$' --format '{{.Names}} ({{.State}})' | sort | tr '\n' ' ')"
  info "Terraform : ${names:-aucun conteneur}"
}
