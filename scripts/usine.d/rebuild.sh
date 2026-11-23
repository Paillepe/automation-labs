#!/usr/bin/env bash
# usine: Reconstruit depuis project/ tout ce que la chaîne a produit (après lab init et après chaque lab catchup)
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"

# Chaque étape s'annonce et ne s'exécute que si ses fichiers existent dans project/. Tout ce qui tournait avant est
# supprimé d'abord : conteneurs, state Terraform, cluster et volumes sont jetables, le code du projet fait foi.
PROJECT="$USINE_ROOT/project"
usine() { bash "$USINE_ROOT/scripts/usine" "$@"; }
have_command() { [[ -f "$USINE_D/$1.sh" ]]; }
have_target() { [[ -f "$(target_file "$1")" ]]; }
skip() { info "— $* : rien à reconstruire"; }

infra_declared() {
  compgen -G "$PROJECT/infra/*.tf" >/dev/null && grep -qsE '^[[:space:]]*resource[[:space:]]+"docker_container"' "$PROJECT"/infra/*.tf
}
k8s_manifests() { compgen -G "$PROJECT/k8s/*.yaml" >/dev/null || compgen -G "$PROJECT/k8s/*.yml" >/dev/null; }
# Les versions de l'application citées par les manifests (image reservations:<version>).
k8s_versions() {
  cat "$PROJECT"/k8s/*.y*ml 2>/dev/null \
    | sed -nE 's#^[[:space:]-]*image:[[:space:]]*"?([^"[:space:]]*/)?reservations:([0-9][A-Za-z0-9._-]*)"?.*#\2#p' | sort -u
}
monitoring_files() { compgen -G "$PROJECT/monitoring/*.y*ml" >/dev/null || compgen -G "$PROJECT/monitoring/*.json" >/dev/null; }

require_docker
echo "usine rebuild — reconstruction depuis project/"

title "1/6 Nettoyage : tout ce qui tournait est supprimé"
usine down >/dev/null
ok "environnement vide"

title "2/6 Serveur de test srv-test"
if infra_declared; then
  skip "les serveurs sont décrits dans project/infra/ (srv-test n'existe plus depuis le lab terraform)"
else
  run_target up servers
fi

title "3/6 Infrastructure (project/infra/, terraform apply)"
if infra_declared; then
  run_target up infra
else
  skip "project/infra/ ne décrit aucun conteneur"
fi

title "4/6 Configuration (project/ansible/, ansible-playbook)"
if [[ -f "$PROJECT/ansible/site.yml" ]] && infra_declared; then
  ensure_lab_key
  if ! (cd "$PROJECT/ansible" && ANSIBLE_CONFIG="$PROJECT/ansible/ansible.cfg" ansible-playbook site.yml >"${TMPDIR:-/tmp}/usine-ansible.log" 2>&1); then
    fail "ansible-playbook échoue. Fin de sa sortie :"
    tail -n 15 "${TMPDIR:-/tmp}/usine-ansible.log" | sed 's/^/      /'
    exit 1
  fi
  ok "$(grep -E 'ok=[0-9]+' "${TMPDIR:-/tmp}/usine-ansible.log" | sed 's/^ *//' | head -n 2 | tr -s ' ' | paste -sd ';' -)"
else
  skip "pas de project/ansible/site.yml"
fi

title "5/6 Cluster (project/k8s/)"
if k8s_manifests; then
  have_target cluster || die "project/k8s/ existe mais la cible cluster n'est pas fournie (usine up cluster)."
  run_target up cluster
  for version in $(k8s_versions); do
    if have_command release; then
      usine release "$version"
    else
      warn "usine release n'est pas fourni : l'image reservations:$version n'est pas chargée"
    fi
  done
  kubectl apply -f "$PROJECT/k8s/" >/dev/null
  ok "manifests de project/k8s/ appliqués"
else
  skip "pas de manifests dans project/k8s/"
fi

title "6/6 Supervision (project/monitoring/)"
if monitoring_files && have_target monitoring; then
  run_target up monitoring
else
  skip "pas de project/monitoring/, ou cible monitoring non fournie"
fi

# Une épreuve en cours survit au rebuild : l'incident est réinjecté (SPEC §6.4).
if [[ -f "$USINE_ROOT/.usine/incident" ]] && have_command incident; then
  title "Incident en cours : réinjection"
  usine incident resume
fi

echo
ok "Reconstruction terminée. usine status pour voir ce qui tourne."
