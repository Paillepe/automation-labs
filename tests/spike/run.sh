#!/usr/bin/env bash
# Spike d'environnement (SPEC §3.2) : chaque critère se rejoue à la demande, dans le devcontainer.
#   tests/spike/run.sh [k3d] [terraform] [ansible] [clean]     (sans argument : k3d terraform ansible clean)
# Tout ce que le spike crée porte le préfixe « spike » et disparaît avec « clean ».
set -euo pipefail

USINE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
USINE_D="$USINE_ROOT/scripts/usine.d"
# shellcheck source=../../scripts/usine.d/_lib.sh
source "$USINE_D/_lib.sh"
HERE="$USINE_ROOT/tests/spike"
K3S_IMAGE="$(list_images | grep '^rancher/k3s:')"
export KUBECONFIG="$HOME/.kube/spike"

step() { printf '\n▶ %s\n' "$*"; }

spike_k3d() {
  step "k3d : créer le cluster sur le réseau $USINE_NETWORK"
  ensure_network "$USINE_NETWORK"
  if ! k3d cluster list spike >/dev/null 2>&1; then
    k3d cluster create spike --network "$USINE_NETWORK" --image "$K3S_IMAGE" \
      --api-port 127.0.0.1:6550 -p '127.0.0.1:8480:80@loadbalancer' \
      --kubeconfig-update-default=false --kubeconfig-switch-context=false --wait --timeout 240s
  fi
  # Le kubeconfig de k3d vise l'hôte (127.0.0.1:6550) : depuis le devcontainer, on vise le répartiteur par son nom.
  mkdir -p "$HOME/.kube"
  k3d kubeconfig get spike | sed -E 's#server: https://[^[:space:]]+#server: https://k3d-spike-serverlb:6443#' >"$KUBECONFIG"
  chmod 0600 "$KUBECONFIG"
  attach_self

  step "k3d : kubectl get nodes"
  kubectl wait --for=condition=Ready node --all --timeout=120s
  kubectl get nodes

  step "k3d : une requête HTTP traverse Traefik jusqu'à un pod"
  # Traefik est installé par un job Helm après le démarrage du nœud : on attend que son Deployment existe.
  for _ in $(seq 60); do kubectl -n kube-system get deploy/traefik >/dev/null 2>&1 && break; sleep 2; done
  kubectl -n kube-system rollout status deploy/traefik --timeout=180s
  kubectl create deployment whoami --image=traefik/whoami:v1.11.0 --port=80 --replicas=3 --dry-run=client -o yaml | kubectl apply -f -
  kubectl expose deployment whoami --port=80 --dry-run=client -o yaml | kubectl apply -f -
  kubectl create ingress whoami --rule='/*=whoami:80' --dry-run=client -o yaml | kubectl apply -f -
  kubectl rollout status deploy/whoami --timeout=180s
  local code=000
  for _ in $(seq 30); do
    code="$(curl -s -o /tmp/spike-whoami -w '%{http_code}' -m 5 http://k3d-spike-serverlb/ || true)"
    [[ "$code" == 200 ]] && break
    sleep 2
  done
  [[ "$code" == 200 ]] || die "k3d : attendu HTTP 200 par l'Ingress, constaté $code"
  grep -E '^(Hostname|X-Forwarded-Server)' /tmp/spike-whoami
  ok "k3d : cluster joignable, Ingress traversé (depuis l'hôte : curl http://127.0.0.1:8480/)"
}

spike_terraform() {
  step "terraform : init (provider pris dans le miroir local de l'image), apply"
  cd "$HERE/terraform"
  export TF_VAR_infra_dir="$USINE_ROOT/infra" TF_IN_AUTOMATION=1
  terraform init -input=false >/dev/null
  terraform apply -input=false -auto-approve
  step "terraform : plan -detailed-exitcode doit rendre 0 (aucune dérive)"
  terraform plan -input=false -detailed-exitcode >/dev/null
  docker ps --filter name=^spike- --format '  {{.Names}}  {{.Status}}  {{.Networks}}'
  ok "terraform : 2 réseaux, 3 conteneurs, plan sans différence"
}

spike_ansible() {
  step "ansible : joindre les serveurs en SSH, installer un paquet, démarrer un service"
  ensure_lab_key
  attach_self spike-front
  cd "$HERE/ansible"
  export ANSIBLE_CONFIG="$HERE/ansible/ansible.cfg"
  ansible web -m ansible.builtin.ping
  ansible-playbook playbook.yml
  step "ansible : un second passage n'annonce aucun changement"
  ansible-playbook playbook.yml | tee /tmp/spike-ansible
  if grep -E 'changed=[1-9]' /tmp/spike-ansible; then die "ansible : le second passage annonce des changements"; fi
  curl -fsS -m 5 -o /dev/null -w '  nginx sur spike-srv-web-1 : HTTP %{http_code}\n' http://spike-srv-web-1/
  ok "ansible : paquet installé, service démarré sans systemd, second passage sans changement"
}

spike_clean() {
  step "nettoyage : tout ce qui porte le préfixe spike"
  local self
  self="$(self_container)"
  [[ -z "$self" ]] || docker network disconnect spike-front "$self" 2>/dev/null || true
  if [[ -d "$HERE/terraform/.terraform" ]]; then
    (cd "$HERE/terraform" && TF_VAR_infra_dir="$USINE_ROOT/infra" terraform destroy -input=false -auto-approve >/dev/null)
    rm -rf "$HERE/terraform/.terraform" "$HERE/terraform"/terraform.tfstate* "$HERE/terraform/.terraform.lock.hcl"
  fi
  k3d cluster delete spike >/dev/null 2>&1 || true
  rm -f "$KUBECONFIG"
  local left
  left="$(docker ps -a --filter name=spike --format '{{.Names}}')"
  [[ -z "$left" ]] || die "nettoyage : il reste des conteneurs : $left"
  ok "nettoyage : plus aucun conteneur spike"
}

require_docker
[[ $# -gt 0 ]] || set -- k3d terraform ansible clean
for target in "$@"; do
  case "$target" in
    k3d | terraform | ansible | clean) "spike_$target" ;;
    *) die "cible inconnue : $target (k3d, terraform, ansible, clean)" ;;
  esac
done
