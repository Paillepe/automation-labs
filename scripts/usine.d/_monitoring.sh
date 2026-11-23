#!/usr/bin/env bash
# Stack de monitoring (flux Fournitures) : Prometheus, Alertmanager, Grafana, Loki, Alloy et le récepteur de
# notifications, dans l'espace de noms « monitoring » du cluster.
# À sourcer après _lib.sh et _cluster.sh : source "$USINE_D/_monitoring.sh"
#
# Ce que lit la stack dans le projet de l'étudiant (tout est facultatif, relu à chaque « usine up monitoring ») :
#   project/monitoring/rules/*.yml          règles d'alerte et d'enregistrement de Prometheus
#   project/monitoring/alertmanager.yml     routage d'Alertmanager (absent : les alertes ne vont nulle part)
#   project/monitoring/dashboards/*.json    tableaux de bord de Grafana, dossier « Valmorin »
# Aucun fichier n'est monté : ils entrent dans le cluster en ConfigMaps (kubectl apply). Un fichier invalide est
# refusé avant d'être appliqué, et la stack garde la configuration précédente. Seul le composant dont la
# configuration a changé redémarre.

MON_NS=monitoring
MON_INFRA="$USINE_ROOT/infra/monitoring"
MON_K8S="$USINE_ROOT/infra/k8s/monitoring"
# USINE_MONITORING_DIR : un autre dossier que project/monitoring (tests autonomes des fournitures).
MON_PROJECT="${USINE_MONITORING_DIR:-$USINE_ROOT/project/monitoring}"
MON_DEPLOYMENTS=(prometheus alertmanager receiver loki alloy grafana)

# Fichiers d'un dossier du projet (motifs donnés), triés ; rien si le dossier manque.
_mon_files() {
  local dir="$1" pattern
  shift
  [[ -d "$dir" ]] || return 0
  for pattern in "$@"; do
    find "$dir" -maxdepth 1 -type f -name "$pattern"
  done | sort
}

# Valide un fichier dans un conteneur jetable de l'image fournie : le fichier passe par l'entrée standard.
_mon_validate_in() {
  local image="$1" tool_cmd="$2" file="$3" out
  if ! out="$(docker run --rm -i --network none --entrypoint sh "$image" -c "cat > /tmp/f.yml && $tool_cmd /tmp/f.yml" <"$file" 2>&1)"; then
    fail "${file#"$USINE_ROOT"/} est refusé :"
    sed -e 's#/tmp/f.yml#'"${file##*/}"'#g' -e 's/^/      /' <<<"$out" | grep -v '^      Checking' | head -n 15
    return 1
  fi
}

monitoring_validate() {
  local prom am file bad=0
  prom="$(pinned_ref prom/prometheus:v3.16.0)"
  am="$(pinned_ref prom/alertmanager:v0.35.0)"
  while read -r file; do
    [[ -n "$file" ]] || continue
    _mon_validate_in "$prom" "promtool check rules" "$file" || bad=1
  done < <(_mon_files "$MON_PROJECT/rules" '*.yml' '*.yaml')
  if [[ -f "$MON_PROJECT/alertmanager.yml" ]]; then
    _mon_validate_in "$am" "amtool check-config" "$MON_PROJECT/alertmanager.yml" || bad=1
  fi
  while read -r file; do
    [[ -n "$file" ]] || continue
    if ! jq -e 'type == "object" and has("panels")' "$file" >/dev/null 2>&1; then
      fail "${file#"$USINE_ROOT"/} est refusé : ce n'est pas un tableau de bord Grafana (objet JSON avec « panels »)."
      bad=1
    fi
  done < <(_mon_files "$MON_PROJECT/dashboards" '*.json')
  [[ "$bad" == 0 ]]
}

# Crée ou met à jour une ConfigMap ; rend l'empreinte de son contenu. _mon_configmap <nom> [--from-file=…]…
_mon_configmap() {
  local name="$1" yaml
  shift
  yaml="$(kubectl -n "$MON_NS" create configmap "$name" "$@" --dry-run=client -o yaml)" || return 1
  kubectl apply -f - >/dev/null <<<"$yaml" || return 1
  sha256sum <<<"$yaml" | cut -c1-16
}

# --from-file pour chaque fichier d'un dossier du projet.
_mon_from_project() {
  local file
  while read -r file; do
    [[ -n "$file" ]] && printf -- '--from-file=%s\n' "$file"
  done < <(_mon_files "$@")
}

monitoring_configmaps() {
  local rules=() dashboards=() alertmanager="$MON_INFRA/alertmanager.yml"
  mapfile -t rules < <(_mon_from_project "$MON_PROJECT/rules" '*.yml' '*.yaml')
  mapfile -t dashboards < <(_mon_from_project "$MON_PROJECT/dashboards" '*.json')
  [[ -f "$MON_PROJECT/alertmanager.yml" ]] && alertmanager="$MON_PROJECT/alertmanager.yml"

  declare -gA MON_HASH=()
  MON_HASH[prometheus]="$(_mon_configmap prometheus-config --from-file="$MON_INFRA/prometheus.yml")$(_mon_configmap prometheus-rules "${rules[@]}")"
  MON_HASH[alertmanager]="$(_mon_configmap alertmanager-config --from-file=alertmanager.yml="$alertmanager")"
  MON_HASH[receiver]="$(_mon_configmap receiver-code --from-file=receiver.mjs="$MON_INFRA/receiver.js")"
  MON_HASH[loki]="$(_mon_configmap loki-config --from-file="$MON_INFRA/loki.yaml")"
  MON_HASH[alloy]="$(_mon_configmap alloy-config --from-file="$MON_INFRA/config.alloy")"
  MON_HASH[grafana]="$(_mon_configmap grafana-datasources --from-file=datasources.yaml="$MON_INFRA/grafana-datasources.yaml")$(_mon_configmap grafana-providers --from-file=providers.yaml="$MON_INFRA/grafana-dashboards.yaml")$(_mon_configmap grafana-dashboards "${dashboards[@]}")"

  local h
  for h in "${MON_HASH[@]}"; do [[ ${#h} -ge 16 ]] || return 1; done
  info "Règles : ${#rules[@]} fichier(s) de project/monitoring/rules/"
  if [[ "$alertmanager" == "$MON_PROJECT/alertmanager.yml" ]]; then
    info "Routage : project/monitoring/alertmanager.yml"
  else
    info "Routage : aucun (project/monitoring/alertmanager.yml absent) — les alertes ne partent nulle part"
  fi
  info "Tableaux de bord : ${#dashboards[@]} fichier(s) de project/monitoring/dashboards/"
}

# Pods de la stack qui ne sont pas prêts, et la fin de leurs logs.
_mon_explain() {
  local d
  for d in "${MON_DEPLOYMENTS[@]}"; do
    kubectl -n "$MON_NS" rollout status "deploy/$d" --timeout=1s >/dev/null 2>&1 && continue
    fail "$d n'est pas prêt"
    kubectl -n "$MON_NS" logs "deploy/$d" --tail=5 2>&1 | sed 's/^/      /' || true
  done
}

monitoring_up() {
  cluster_up
  title "Monitoring (Prometheus, Alertmanager, Grafana, Loki, Alloy, récepteur)"
  monitoring_validate || die "configuration refusée : corrige project/monitoring/, puis relance « usine up monitoring ». La stack garde sa configuration précédente."

  mapfile -t images < <(cluster_image_list monitoring)
  cluster_import "${images[@]}"

  kubectl apply -f "$MON_K8S/00-namespace.yaml" -f "$MON_K8S/10-rbac.yaml" >/dev/null || die "impossible de créer l'espace de noms monitoring."
  monitoring_configmaps || die "impossible de créer les ConfigMaps de la stack."

  local file name
  for file in "$MON_K8S"/[2-9]*.yaml; do
    name="$(basename "$file" .yaml)"
    name="${name#*-}"
    sed "s/@config@/${MON_HASH[$name]:-none}/" "$file" | kubectl apply -f - >/dev/null || die "impossible d'appliquer ${file#"$USINE_ROOT"/}."
  done
  cluster_heal_pulls

  info "Attente de la stack (au plus 4 min au premier lancement)…"
  local d deadline=$((SECONDS + 240))
  for d in "${MON_DEPLOYMENTS[@]}"; do
    if ! kubectl -n "$MON_NS" rollout status "deploy/$d" --timeout="$((deadline > SECONDS ? deadline - SECONDS : 1))s" >/dev/null 2>&1; then
      _mon_explain
      die "la stack de monitoring n'est pas prête : kubectl -n monitoring get pods."
    fi
  done
  ok "Stack prête : prometheus, alertmanager, grafana, loki, alloy, receiver"
  echo
  info "Depuis le navigateur du poste :"
  info "  Grafana       http://127.0.0.1:$USINE_GRAFANA_PORT/"
  info "  Prometheus    http://127.0.0.1:$USINE_PROMETHEUS_PORT/"
  info "  Alertmanager  http://127.0.0.1:$USINE_ALERTMANAGER_PORT/"
  info "  Notifications http://127.0.0.1:$USINE_RECEIVER_PORT/notifications"
  info "Dans le cluster : http://prometheus.monitoring:9090, http://alertmanager.monitoring:9093, http://loki.monitoring:3100,"
  info "  récepteur pour Alertmanager : http://receiver.monitoring:8080/<chemin libre>"
  info "Après chaque modification de project/monitoring/ : « usine up monitoring »."
}

monitoring_down() {
  title "Monitoring"
  if ! cluster_exists || ! cluster_running; then
    ok "Rien à arrêter (pas de cluster)"
    return 0
  fi
  [[ -f "$(kubeconfig_path)" ]] || cluster_kubeconfig
  kubectl delete namespace "$MON_NS" --ignore-not-found --wait=true --timeout=120s >/dev/null 2>&1 || die "impossible de supprimer l'espace de noms monitoring."
  kubectl delete clusterrolebinding,clusterrole usine-prometheus usine-alloy --ignore-not-found >/dev/null 2>&1 || true
  ok "Stack de monitoring supprimée (données comprises)"
}

monitoring_status() {
  if ! cluster_exists || ! cluster_running || ! kubectl get namespace "$MON_NS" >/dev/null 2>&1; then
    info "monitoring : arrêté"
    return 0
  fi
  local ready
  ready="$(kubectl -n "$MON_NS" get deploy --no-headers 2>/dev/null | awk '{ printf "%s %s, ", $1, $2 }' | sed 's/, $//')"
  info "monitoring : $ready"
}
