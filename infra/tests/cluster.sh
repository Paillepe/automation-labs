#!/usr/bin/env bash
# Test autonome de la cible « cluster » (usine up / down cluster, usine attach). À lancer dans le devcontainer.
# Vérifie : création sans aucun téléchargement par le cluster (tout vient de l'import), DNS, Ingress, base de
# données joignable et persistante, ports liés à 127.0.0.1, idempotence, redémarrage, kubeconfig régénéré,
# suppression. Nettoie derrière lui.
# ATTENTION : remplace le cluster du poste. Jamais pendant une séance.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"
export USINE_ROOT="$ROOT" USINE_D="$ROOT/scripts/usine.d"
# shellcheck source=../../scripts/usine.d/_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=../../scripts/usine.d/_cluster.sh
source "$USINE_D/_cluster.sh"

usine() { "$ROOT/scripts/usine" "$@"; }
cleanup() { usine down cluster >/dev/null 2>&1 || true; }
trap cleanup EXIT

section "Départ propre"
cleanup
expect "aucun conteneur du cluster" "" "$(docker ps -a --filter "name=^k3d-$USINE_CLUSTER-" --format '{{.Names}}')"

section "usine up cluster, téléchargements interdits au cluster"
start=$SECONDS
if out="$(USINE_CLUSTER_OFFLINE=1 usine up cluster 2>&1)"; then pass "usine up cluster (code 0, $((SECONDS - start)) s)"; else
  miss "usine up cluster (code 0)"
  echo "$out" | tail -n 20
fi
expect "le nœud est prêt" "True" "$(kubectl get node "$USINE_CLUSTER_NODE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)"
not_running="$(kubectl get pods -A --no-headers 2>/dev/null | awk '$4 != "Running" && $4 != "Completed" { print $1 "/" $2 " " $4 }')"
expect "tous les pods tournent sans avoir rien téléchargé" "" "$not_running"
# Contre-épreuve : une image qui n'a pas été importée ne peut pas être tirée. Le mode hors ligne est donc effectif.
kubectl run usine-t-offline --image=busybox:1.36.1 --restart=Never --command -- true >/dev/null 2>&1 || true
reason=""
for _ in $(seq 30); do
  reason="$(kubectl get pod usine-t-offline -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}' 2>/dev/null || true)"
  [[ "$reason" == ErrImagePull || "$reason" == ImagePullBackOff ]] && break
  sleep 1
done
expect_match "contre-épreuve : une image non importée ne se télécharge pas" 'ErrImagePull|ImagePullBackOff' "$reason"
kubectl delete pod usine-t-offline --wait=false >/dev/null 2>&1 || true

section "Réseau, ports, Ingress"
expect_match "le devcontainer est sur le réseau usine" "$USINE_NETWORK" \
  "$(docker inspect "$(self_container)" --format '{{range $n, $_ := .NetworkSettings.Networks}}{{$n}} {{end}}' 2>/dev/null || echo 'hors devcontainer')"
expect "le kubeconfig vise le répartiteur par son nom" "https://$USINE_CLUSTER_LB:6443" "$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')"
published="$(docker port "$USINE_CLUSTER_LB" | awk '{ print $3 }' | sort -u)"
expect "aucun port publié ailleurs que sur 127.0.0.1" "" "$(grep -v '^127\.0\.0\.1:' <<<"$published" || true)"
expect_match "Ingress publié sur 127.0.0.1:$USINE_INGRESS_PORT" "127.0.0.1:$USINE_INGRESS_PORT" "$published"
expect "Traefik répond par l'Ingress (404 sans route)" 404 "$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$(cluster_http)/" || true)"

section "Base de données"
psql() { kubectl -n data exec deploy/db -- psql -U reservations -d reservations -tAc "$1"; }
check "PostgreSQL répond dans le pod" psql 'select 1'
# Un pod jetable dans « default » : on attend qu'il se termine, puis on lit ses logs (kubectl run -i perd parfois
# la sortie d'un pod trop rapide).
probe_pod() {
  local pod="usine-t-$1"
  kubectl run "$pod" --restart=Never --image=postgres:18-alpine --image-pull-policy=IfNotPresent \
    --env PGPASSWORD="$2" --command -- psql -h db.data -U reservations -d reservations -tAc 'select 42' >/dev/null 2>&1
  kubectl wait "pod/$pod" --for=jsonpath='{.status.phase}'=Succeeded --timeout=60s >/dev/null 2>&1 \
    || kubectl wait "pod/$pod" --for=jsonpath='{.status.phase}'=Failed --timeout=5s >/dev/null 2>&1 || true
  kubectl logs "$pod" 2>/dev/null | grep -x 42 || true
  kubectl delete pod "$pod" --wait=false >/dev/null 2>&1 || true
}
expect "joignable depuis un autre espace de noms par db.data, avec le mot de passe de lab" 42 "$(probe_pod ok lab-cluster-password)"
expect "un mauvais mot de passe est refusé" "" "$(probe_pod ko mauvais)"
psql "create table if not exists usine_t (v text); insert into usine_t values ('persiste');" >/dev/null

section "Idempotence et redémarrage"
id1="$(docker inspect "$USINE_CLUSTER_NODE" --format '{{.Id}}')"
start=$SECONDS
if usine up cluster >/dev/null 2>&1; then pass "seconde exécution (code 0, $((SECONDS - start)) s)"; else miss "seconde exécution (code 0)"; fi
expect "le nœud n'est pas recréé" "$id1" "$(docker inspect "$USINE_CLUSTER_NODE" --format '{{.Id}}')"
docker stop "$USINE_CLUSTER_NODE" >/dev/null
if out="$(usine up cluster 2>&1)"; then pass "usine up cluster relance un cluster arrêté"; else
  miss "usine up cluster relance un cluster arrêté"
  echo "$out" | tail -n 12
fi
expect "les données de la base survivent au redémarrage" persiste "$(psql 'select v from usine_t' 2>/dev/null || true)"

section "usine attach après une reconstruction du devcontainer"
rm -f "$(kubeconfig_path)"
usine attach >/dev/null 2>&1 || true
check "usine attach régénère le kubeconfig" kubectl get nodes

section "usine down cluster"
if usine down cluster >/dev/null 2>&1; then pass "usine down cluster (code 0)"; else miss "usine down cluster (code 0)"; fi
expect "plus aucun conteneur du cluster" "" "$(docker ps -a --filter "name=^k3d-$USINE_CLUSTER-" --format '{{.Names}}')"
expect "kubeconfig retiré" "absent" "$([[ -f "$(kubeconfig_path)" ]] && echo present || echo absent)"
if usine down cluster >/dev/null 2>&1; then pass "seconde suppression (code 0)"; else miss "seconde suppression (code 0)"; fi

finish
