#!/usr/bin/env bash
# Cluster k3d du cours (flux Fournitures) : création, kubeconfig, import des images, base de données.
# À sourcer après _lib.sh : source "$USINE_D/_cluster.sh"
#
# Le cluster est sur le réseau Docker de l'usine (ADR-0001) : depuis le devcontainer, l'API se joint par
# https://k3d-usine-serverlb:6443 et l'Ingress par http://k3d-usine-serverlb/. Depuis le navigateur du poste,
# par des ports de 127.0.0.1 (variables USINE_*_PORT ci-dessous, fixées à la création du cluster).

USINE_CLUSTER="${USINE_CLUSTER:-usine}"
USINE_CLUSTER_LB="k3d-$USINE_CLUSTER-serverlb"
USINE_CLUSTER_NODE="k3d-$USINE_CLUSTER-server-0"
USINE_CLUSTER_IMAGES="$USINE_ROOT/infra/k8s/images.txt"
USINE_STATE="${USINE_STATE:-$USINE_ROOT/.usine}"

# Ports de 127.0.0.1 vers le cluster, et ports des Services (NodePort) qu'ils visent.
USINE_API_PORT="${USINE_API_PORT:-16443}"
USINE_INGRESS_PORT="${USINE_INGRESS_PORT:-18480}"
USINE_GRAFANA_PORT="${USINE_GRAFANA_PORT:-18300}"
USINE_PROMETHEUS_PORT="${USINE_PROMETHEUS_PORT:-18090}"
USINE_ALERTMANAGER_PORT="${USINE_ALERTMANAGER_PORT:-18093}"
USINE_RECEIVER_PORT="${USINE_RECEIVER_PORT:-18099}"
NODEPORT_GRAFANA=30300
NODEPORT_PROMETHEUS=30090
NODEPORT_ALERTMANAGER=30093
NODEPORT_RECEIVER=30099

# Fichier kubeconfig écrit par usine : le premier de KUBECONFIG, sinon ~/.kube/config.
kubeconfig_path() {
  local first="${KUBECONFIG:-$HOME/.kube/config}"
  echo "${first%%:*}"
}

cluster_exists() { k3d cluster list "$USINE_CLUSTER" >/dev/null 2>&1; }
cluster_running() { [[ "$(docker inspect "$USINE_CLUSTER_NODE" --format '{{.State.Running}}' 2>/dev/null)" == true ]]; }

require_cluster() {
  if ! cluster_exists || ! cluster_running; then die "le cluster n'est pas démarré : lance « usine up cluster »."; fi
  [[ -f "$(kubeconfig_path)" ]] || cluster_kubeconfig
}

# Adresse HTTP de l'Ingress : par le nom du répartiteur depuis le devcontainer, par 127.0.0.1 depuis l'hôte.
cluster_http() {
  if [[ -n "$(self_container)" ]]; then echo "http://$USINE_CLUSTER_LB"; else echo "http://127.0.0.1:$USINE_INGRESS_PORT"; fi
}

# Régénère le kubeconfig (après une reconstruction du devcontainer, ~/.kube est vide). Idempotent.
cluster_kubeconfig() {
  local file config
  file="$(kubeconfig_path)"
  config="$(k3d kubeconfig get "$USINE_CLUSTER" 2>/dev/null)" || return 1
  # k3d écrit l'adresse publiée sur l'hôte ; depuis le devcontainer, on vise le répartiteur par son nom,
  # qui figure dans le certificat du serveur (ADR-0001).
  if [[ -n "$(self_container)" ]]; then
    config="$(sed -E "s#server: https://[^[:space:]]+#server: https://$USINE_CLUSTER_LB:6443#" <<<"$config")"
  fi
  mkdir -p "$(dirname "$file")"
  if [[ "$config" != "$(cat "$file" 2>/dev/null)" ]]; then
    (umask 077 && printf '%s\n' "$config" >"$file")
  fi
  chmod 0600 "$file"
}

# Référence épinglée (nom:étiquette@sha256:…) d'une image de infra/images.txt, vide si elle n'y est pas.
pinned_ref() { list_images | grep -F -- "$1@" | head -n 1 || true; }

# Images de infra/k8s/images.txt pour une phase (cluster, monitoring).
cluster_image_list() {
  sed -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$USINE_CLUSTER_IMAGES" | awk -v p="$1" '$1 == p { print $2 }'
}

# Nom complet tel que le voit containerd : postgres:18 → docker.io/library/postgres:18.
containerd_name() {
  local ref="$1" first="${1%%/*}"
  if [[ "$ref" != */* ]]; then
    echo "docker.io/library/$ref"
  elif [[ "$first" != *.* && "$first" != *:* && "$first" != localhost ]]; then
    echo "docker.io/$ref"
  else
    echo "$ref"
  fi
}

# Identifiant (condensat de configuration) d'une image dans le nœud du cluster, vide si elle n'y est pas.
node_image_id() {
  docker exec "$USINE_CLUSTER_NODE" crictl inspecti -o json "$(containerd_name "$1")" 2>/dev/null | jq -r '.status.id // empty' 2>/dev/null || true
}

# Prépare une image dans le cache Docker sous son nom:étiquette. Une image de infra/images.txt est tirée par
# condensat (déjà là après « usine pull »), puis étiquetée : c'est le condensat qui fait foi, pas l'étiquette.
local_image_ready() {
  local name="$1" ref
  ref="$(pinned_ref "$name")"
  if [[ -n "$ref" ]]; then
    if ! image_present "$ref"; then
      info "$name absente du poste : téléchargement (« usine pull » l'aurait fait chez toi)…"
      docker pull --quiet "$ref" >/dev/null || return 1
    fi
    [[ "$(docker image inspect "$ref" --format '{{.Id}}')" == "$(docker image inspect "$name" --format '{{.Id}}' 2>/dev/null)" ]] \
      || docker tag "$ref" "$name"
    return 0
  fi
  image_present "$name"
}

# Importe des images dans le cluster (k3d image import), seulement celles qui y manquent ou y diffèrent.
cluster_import() {
  local name missing=() out
  for name in "$@"; do
    local_image_ready "$name" || die "image introuvable sur le poste : $name. Lance « usine pull », puis recommence."
    [[ "$(node_image_id "$name")" == "$(docker image inspect "$name" --format '{{.Id}}')" ]] || missing+=("$name")
  done
  if [[ "${#missing[@]}" -eq 0 ]]; then
    ok "Images déjà présentes dans le cluster ($#)"
    return 0
  fi
  info "Import de ${#missing[@]} image(s) dans le cluster, sans passer par le réseau…"
  if ! out="$(k3d image import --cluster "$USINE_CLUSTER" --mode tools-node "${missing[@]}" 2>&1)"; then
    tail -n 5 <<<"$out" | sed 's/^/      /'
    die "l'import des images dans le cluster a échoué."
  fi
  ok "Images importées : ${missing[*]}"
}

# Un pod lancé avant l'import a pu échouer à tirer son image (pas de réseau) : on le relance tout de suite
# plutôt que d'attendre la fin de son délai de reprise.
cluster_heal_pulls() {
  local pods
  pods="$(kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}{" "}{.metadata.name}{" "}{.status.containerStatuses[*].state.waiting.reason}{.status.initContainerStatuses[*].state.waiting.reason}{"\n"}{end}' 2>/dev/null \
    | awk '/ErrImagePull|ImagePullBackOff/ { print $1, $2 }')"
  [[ -n "$pods" ]] || return 0
  while read -r ns pod; do
    kubectl -n "$ns" delete pod "$pod" --wait=false >/dev/null 2>&1 || true
  done <<<"$pods"
}

# Attend une condition (commande) au plus $1 secondes.
wait_until() {
  local seconds="$1"
  shift
  local deadline=$((SECONDS + seconds))
  until "$@" >/dev/null 2>&1; do
    ((SECONDS < deadline)) || return 1
    sleep 2
  done
}

traefik_ready() { kubectl -n kube-system rollout status deploy/traefik --timeout=5s; }
ingress_answers() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 3 "$(cluster_http)/" || true)"
  [[ "$code" =~ ^[2-5][0-9][0-9]$ ]]
}

cluster_create() {
  local k3s out
  k3s="$(list_images | grep '^rancher/k3s:' | head -n 1)"
  [[ -n "$k3s" ]] || die "image k3s absente de infra/images.txt."
  image_present "$k3s" || {
    info "Téléchargement de k3s (« usine pull » l'aurait fait chez toi)…"
    docker pull --quiet "$k3s" >/dev/null || die "impossible de télécharger $k3s."
  }
  # Tests seulement (infra/tests/cluster.sh) : USINE_CLUSTER_OFFLINE=1 interdit au cluster tout téléchargement
  # d'image, pour prouver que tout ce qu'il lance vient de l'import (le réseau de l'école ne décide de rien).
  local extra=()
  if [[ "${USINE_CLUSTER_OFFLINE:-}" == 1 ]]; then
    local registries
    registries="$(mktemp)"
    printf 'mirrors:\n  "*":\n    endpoint: ["http://127.0.0.1:9"]\n' >"$registries"
    extra=(--registry-config "$registries" --k3s-arg "--disable-default-registry-endpoint@server:*")
  fi
  info "Création du cluster « $USINE_CLUSTER » (un nœud, environ 30 s)…"
  if ! out="$(k3d cluster create "$USINE_CLUSTER" --network "$USINE_NETWORK" --image "$k3s" "${extra[@]}" \
    --servers 1 --agents 0 \
    --api-port "127.0.0.1:$USINE_API_PORT" \
    -p "127.0.0.1:$USINE_INGRESS_PORT:80@loadbalancer" \
    -p "127.0.0.1:$USINE_GRAFANA_PORT:$NODEPORT_GRAFANA@loadbalancer" \
    -p "127.0.0.1:$USINE_PROMETHEUS_PORT:$NODEPORT_PROMETHEUS@loadbalancer" \
    -p "127.0.0.1:$USINE_ALERTMANAGER_PORT:$NODEPORT_ALERTMANAGER@loadbalancer" \
    -p "127.0.0.1:$USINE_RECEIVER_PORT:$NODEPORT_RECEIVER@loadbalancer" \
    --kubeconfig-update-default=false --kubeconfig-switch-context=false \
    --wait --timeout 240s 2>&1)"; then
    tail -n 8 <<<"$out" | sed 's/^/      /'
    hint "Un port est peut-être déjà pris sur le poste : change USINE_INGRESS_PORT (ou un autre USINE_*_PORT)."
    k3d cluster delete "$USINE_CLUSTER" >/dev/null 2>&1 || true
    die "la création du cluster a échoué."
  fi
  ok "Cluster créé"
}

cluster_up() {
  require_docker
  title "Cluster Kubernetes (k3d)"
  ensure_network "$USINE_NETWORK"
  if ! cluster_exists; then
    cluster_create
  elif ! cluster_running; then
    info "Redémarrage du cluster existant…"
    k3d cluster start "$USINE_CLUSTER" --wait --timeout 180s >/dev/null 2>&1 || die "le cluster ne redémarre pas : « usine down cluster », puis « usine up cluster »."
    ok "Cluster redémarré"
  else
    ok "Cluster déjà démarré"
  fi
  attach_self "$USINE_NETWORK"
  cluster_kubeconfig || die "impossible d'écrire le kubeconfig."
  wait_until 120 kubectl get --raw /readyz || die "l'API du cluster ne répond pas ($USINE_CLUSTER_LB:6443)."

  mapfile -t images < <(cluster_image_list cluster)
  cluster_import "${images[@]}"
  cluster_heal_pulls

  kubectl wait --for=condition=Ready node --all --timeout=120s >/dev/null || die "le nœud du cluster n'est pas prêt."
  # Traefik est installé par une tâche Helm après le démarrage du nœud : on attend qu'il existe, puis qu'il soit prêt.
  if ! wait_until 180 traefik_ready; then
    cluster_heal_pulls
    wait_until 120 traefik_ready || die "Traefik (contrôleur Ingress) n'est pas prêt : kubectl -n kube-system get pods."
  fi
  kubectl -n kube-system rollout status deploy/coredns --timeout=120s >/dev/null || die "CoreDNS n'est pas prêt."
  wait_until 60 ingress_answers || die "l'Ingress ne répond pas sur $(cluster_http)/."
  ok "Nœud, DNS et Ingress (Traefik) prêts"

  cluster_db_up
  echo
  info "Kubeconfig : $(kubeconfig_path) — essaie « kubectl get nodes »."
  info "Ingress depuis le devcontainer : $USINE_CLUSTER_LB:80 · depuis le navigateur : http://127.0.0.1:$USINE_INGRESS_PORT/"
  info "Base de données : hôte db.data, base reservations, utilisateur reservations (Secret data/db-credentials)."
}

# Base PostgreSQL fournie, dans l'espace de noms « data » (infra/k8s/db.yaml).
cluster_db_up() {
  kubectl apply -f "$USINE_ROOT/infra/k8s/db.yaml" >/dev/null || die "impossible d'appliquer infra/k8s/db.yaml."
  kubectl -n data rollout status deploy/db --timeout=180s >/dev/null || {
    cluster_heal_pulls
    kubectl -n data rollout status deploy/db --timeout=120s >/dev/null || die "la base « db » ne démarre pas : kubectl -n data get pods."
  }
  ok "Base de données prête (db.data:5432)"
  cluster_provided_up
}

# Ce qu'un incident en cours a changé du côté fourni, et qui doit survivre à un cluster recréé (« usine rebuild »
# supprime tout) : déposé par le script de l'incident dans .usine/provided/, relu ici, après la base.
#   hooks/*.sh    scripts sourcés dans l'ordre, avec les fonctions de ce fichier
#   k8s/*.yaml    objets appliqués tels quels
cluster_provided_up() {
  local dir="$USINE_STATE/provided" hook
  [[ -d "$dir" ]] || return 0
  for hook in "$dir"/hooks/*.sh; do
    [[ -f "$hook" ]] || continue
    # shellcheck source=/dev/null
    source "$hook" || die "le script fourni par l'incident en cours a échoué : ${hook#"$USINE_ROOT"/}."
  done
  if compgen -G "$dir/k8s/*.yaml" >/dev/null; then
    kubectl apply -f "$dir/k8s/" >/dev/null || die "impossible d'appliquer .usine/provided/k8s/."
  fi
}

cluster_down() {
  title "Cluster Kubernetes (k3d)"
  # Le kubeconfig est-il celui qu'usine a écrit ? À regarder avant k3d, qui en retire le cluster en le supprimant.
  local file ours=0
  file="$(kubeconfig_path)"
  if [[ -f "$file" ]] && grep -q "k3d-$USINE_CLUSTER" "$file"; then ours=1; fi
  if cluster_exists; then
    k3d cluster delete "$USINE_CLUSTER" >/dev/null 2>&1 || die "impossible de supprimer le cluster."
    ok "Cluster supprimé (base de données et monitoring compris)"
  else
    ok "Aucun cluster"
  fi
  if [[ "$ours" == 1 ]]; then rm -f "$file"; fi
}

cluster_status() {
  if ! cluster_exists; then
    info "cluster : arrêté"
    return 0
  fi
  if ! cluster_running; then
    info "cluster : créé mais arrêté (usine up cluster)"
    return 0
  fi
  local version mem
  version="$(kubectl version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // "?"' || echo '?')"
  mem="$(docker stats --no-stream --format '{{.MemUsage}}' "$USINE_CLUSTER_NODE" 2>/dev/null | cut -d/ -f1 || true)"
  info "cluster : démarré, Kubernetes $version, mémoire du nœud ${mem:-?}"
  kubectl get pods -A --no-headers 2>/dev/null | awk '$1 != "kube-system" { printf "      %-12s %-40s %s\n", $1, $2, $4 }' || true
}
