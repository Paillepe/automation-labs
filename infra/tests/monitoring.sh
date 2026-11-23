#!/usr/bin/env bash
# Test autonome de la cible « monitoring » (usine up / down monitoring) et de l'incident « erreurs ».
# À lancer dans le devcontainer. Un projet fictif (règles, routage, tableau de bord) est écrit dans un dossier
# temporaire, désigné par USINE_MONITORING_DIR : project/ n'est pas touché.
# Vérifie : la stack démarre dans un cluster privé de téléchargements (tout vient de l'import) ; l'application est
# découverte sans annotation ; les règles, le routage et le tableau de bord du projet sont chargés ; un fichier
# invalide est refusé sans rien casser ; seul le composant modifié redémarre ; « usine incident erreurs » fait
# passer l'alerte à firing, le récepteur reçoit la notification, Loki a la référence de l'erreur ; « down » nettoie.
# ATTENTION : remplace le cluster du poste. Jamais pendant une séance.
# shellcheck disable=SC2015 # « commande && pass … || miss … » : pass rend toujours 0
set -euo pipefail
source "$(dirname "$0")/_lib.sh"
export USINE_ROOT="$ROOT" USINE_D="$ROOT/scripts/usine.d"
# shellcheck source=../../scripts/usine.d/_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=../../scripts/usine.d/_cluster.sh
source "$USINE_D/_cluster.sh"

PROJECT="$(mktemp -d)"
export USINE_MONITORING_DIR="$PROJECT"
NS=usine-t-mon
usine() { "$ROOT/scripts/usine" "$@"; }
cleanup() {
  usine down cluster >/dev/null 2>&1 || true
  rm -rf "$PROJECT"
}
trap cleanup EXIT

api() { kubectl get --raw "/api/v1/namespaces/monitoring/services/$1/proxy$2"; }
prom() { api "prometheus:9090" "/api/v1/$1"; }
pod_uid() { kubectl -n monitoring get pods -l "app.kubernetes.io/name=$1" -o jsonpath='{.items[0].metadata.uid}'; }

mkdir -p "$PROJECT/rules" "$PROJECT/dashboards"
cat >"$PROJECT/rules/alertes.yml" <<'EOF'
groups:
  - name: reservations
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{job="reservations",status=~"5.."}[1m])) / sum(rate(http_requests_total{job="reservations"}[1m])) > 0.05
        for: 30s
        labels: { severity: critical }
      - alert: HighCpuUsage
        expr: sum by (pod) (rate(container_cpu_usage_seconds_total{container="reservations"}[2m])) > 0.8
        for: 2m
      - alert: HighMemoryUsage
        expr: max by (pod) (container_memory_working_set_bytes{container="reservations"} / container_spec_memory_limit_bytes{container="reservations"}) > 0.9
        for: 2m
EOF
cat >"$PROJECT/alertmanager.yml" <<'EOF'
route: { receiver: equipe, group_wait: 10s, group_interval: 30s }
receivers:
  - name: equipe
    webhook_configs: [{ url: http://receiver.monitoring.svc:8080/alertmanager, send_resolved: true }]
EOF
cat >"$PROJECT/dashboards/reservations.json" <<'EOF'
{ "uid": "reservations", "title": "Réservations", "schemaVersion": 39,
  "panels": [ { "id": 1, "type": "timeseries", "title": "Requêtes par statut",
    "datasource": { "type": "prometheus", "uid": "prometheus" },
    "targets": [ { "refId": "A", "expr": "sum by (status) (rate(http_requests_total{job=\"reservations\"}[1m]))" } ] } ] }
EOF

section "usine up monitoring, téléchargements interdits au cluster"
usine down cluster >/dev/null 2>&1 || true
start=$SECONDS
USINE_CLUSTER_OFFLINE=1 usine up cluster >/dev/null 2>&1 && pass "cluster créé hors ligne" || miss "cluster créé hors ligne"
if out="$(usine up monitoring 2>&1)"; then pass "usine up monitoring (code 0, $((SECONDS - start)) s cluster compris)"; else
  miss "usine up monitoring (code 0)"
  echo "$out" | tail -n 20
fi
for d in prometheus alertmanager grafana loki alloy receiver; do
  check "$d est prêt" kubectl -n monitoring rollout status "deploy/$d" --timeout=5s
done
expect_match "le projet est annoncé : 1 fichier de règles, routage, 1 tableau de bord" "Règles : 1 .*Routage : .*alertmanager.yml.*Tableaux de bord : 1" "$(tr '\n' ' ' <<<"$out")"
published="$(docker port "$USINE_CLUSTER_LB" | awk '{ print $3 }' | sort -u)"
expect "aucun port publié ailleurs que sur 127.0.0.1" "" "$(grep -v '^127\.0\.0\.1:' <<<"$published" || true)"

section "L'application, découverte sans annotation"
usine release 1.0.0 --local >/dev/null
kubectl create namespace "$NS" >/dev/null
kubectl -n "$NS" create deployment reservations --image=reservations:1.0.0 --replicas=2 --port=8080 >/dev/null
kubectl -n "$NS" set env deploy/reservations FAULT_TOKEN=lab-fault-token DB_HOST=db.data DB_PASSWORD=lab-cluster-password >/dev/null
kubectl -n "$NS" set resources deploy/reservations --limits=memory=192Mi --requests=cpu=50m,memory=64Mi >/dev/null
kubectl -n "$NS" expose deploy/reservations --port=80 --target-port=8080 >/dev/null
kubectl -n "$NS" rollout status deploy/reservations --timeout=120s >/dev/null && pass "2 pods de l'application" || miss "2 pods de l'application"
targets_up() { [[ "$(prom 'query?query=count(up%7Bjob%3D%22reservations%22%7D%3D%3D1)' | jq -r '.data.result[0].value[1] // 0')" == 2 ]]; }
wait_for 60 targets_up && pass "Prometheus : 2 cibles reservations up" || miss "Prometheus : 2 cibles reservations up — $(prom 'targets?state=active' | jq -c '[.data.activeTargets[] | {job: .labels.job, h: .health, e: .lastError}]' | head -c 400)"
cadvisor() { [[ "$(prom 'query?query=count(container_memory_working_set_bytes%7Bcontainer%3D%22reservations%22%7D)' | jq -r '.data.result[0].value[1] // 0')" -ge 2 ]]; }
wait_for 60 cadvisor && pass "cAdvisor : mémoire des conteneurs de l'application" || miss "cAdvisor : mémoire des conteneurs de l'application"
check "cAdvisor : limite mémoire connue (container_spec_memory_limit_bytes)" \
  bash -c "kubectl get --raw '/api/v1/namespaces/monitoring/services/prometheus:9090/proxy/api/v1/query?query=container_spec_memory_limit_bytes%7Bcontainer%3D%22reservations%22%7D' | jq -e '.data.result | length > 0'"

section "Configuration du projet chargée"
expect "les trois règles du projet sont chargées" "HighCpuUsage HighErrorRate HighMemoryUsage" \
  "$(prom rules | jq -r '[.data.groups[].rules[].name] | sort | join(" ")')"
expect_match "Alertmanager suit le routage du projet" "receiver: equipe" "$(api alertmanager:9093 /api/v2/status | jq -r .config.original)"
expect "Grafana a le tableau de bord du projet" "Réservations" "$(api grafana:3000 '/api/search?query=' | jq -r '.[] | select(.uid=="reservations") | .title')"
expect "Grafana : sources Prometheus et Loki" "loki prometheus" "$(api grafana:3000 /api/datasources | jq -r '[.[].uid] | sort | join(" ")')"

section "Fichier invalide refusé, rien de cassé ; seul le composant modifié redémarre"
uid_prom="$(pod_uid prometheus)"
uid_graf="$(pod_uid grafana)"
printf 'groups:\n  - name: cassé\n    rules:\n      - alert: Casse\n        expr: sum(rate(\n' >"$PROJECT/rules/casse.yml"
set +e
out="$(usine up monitoring 2>&1)"
rc=$?
set -e
expect "règle invalide : code 1" 1 "$rc"
expect_match "le fichier fautif est nommé" "casse.yml est refusé" "$out"
expect "Prometheus n'a pas redémarré" "$uid_prom" "$(pod_uid prometheus)"
expect "les règles précédentes sont toujours chargées" 3 "$(prom rules | jq '[.data.groups[].rules[]] | length')"
rm "$PROJECT/rules/casse.yml"
sed -i 's/for: 30s/for: 20s/' "$PROJECT/rules/alertes.yml"
usine up monitoring >/dev/null 2>&1 && pass "règle modifiée : usine up monitoring (code 0)" || miss "règle modifiée : usine up monitoring (code 0)"
[[ "$(pod_uid prometheus)" != "$uid_prom" ]] && pass "Prometheus a redémarré sur la nouvelle règle" || miss "Prometheus a redémarré sur la nouvelle règle"
expect "Grafana n'a pas redémarré" "$uid_graf" "$(pod_uid grafana)"
expect "la nouvelle durée est prise en compte" 20 "$(prom rules | jq -r '.data.groups[].rules[] | select(.name=="HighErrorRate") | .duration')"
wait_for 60 targets_up || true

section "usine incident erreurs : alerte, notification, référence dans les logs"
api receiver:8080 /notifications >/dev/null
kubectl -n monitoring exec deploy/receiver -- node -e 'fetch("http://127.0.0.1:8080/notifications",{method:"DELETE"})' >/dev/null
out="$(USINE_ERREURS_DURATION=150 usine incident erreurs 2>&1)" && pass "usine incident erreurs (code 0)" || miss "usine incident erreurs — $(tail -n 3 <<<"$out")"
request_id="$(grep -oE 'support-[0-9A-F]{8}' <<<"$out" | head -n 1)"
expect_match "le ticket cite l'identifiant d'une requête" '^support-[0-9A-F]{8}$' "$request_id"
firing() { prom alerts | jq -e '.data.alerts[] | select(.labels.alertname=="HighErrorRate" and .state=="firing")' >/dev/null; }
wait_for 180 firing && pass "HighErrorRate passe à firing" || miss "HighErrorRate passe à firing — $(prom alerts | jq -c '.data.alerts' | head -c 300)"
notified() { api receiver:8080 /notifications | jq -e '.[] | select(any(.body.alerts[]?; .labels.alertname=="HighErrorRate"))' >/dev/null; }
wait_for 90 notified && pass "le récepteur a reçu la notification" || miss "le récepteur a reçu la notification"
loki_ref() {
  local q
  q="$(jq -rn --arg id "$request_id" '{query: ("{namespace=\"usine-t-mon\"} | json | event=\"fault_error\" | request_id=\"" + $id + "\""), limit: "5"} | to_entries | map("\(.key)=\(.value|@uri)") | join("&")')"
  api loki:3100 "/loki/api/v1/query_range?$q&since=15m" | jq -r '.data.result[].values[][1]' | jq -r .error_ref | grep -E '^ERR-[0-9A-F]{8}$'
}
wait_for 60 loki_ref && ref="$(loki_ref | head -n 1)" || ref=""
expect_match "Loki : la requête du ticket a une référence d'erreur" '^ERR-[0-9A-F]{8}$' "$ref"
expect "la référence n'est pas dans le ticket" "" "$(grep -F -- "${ref:-ERR-ABSENTE}" <<<"$out" || true)"
expect "son empreinte est notée dans .usine/incidents/erreurs.env" "$(printf '%s' "$ref" | sha256sum | cut -d' ' -f1)" \
  "$(sed -n 's/^ERROR_REF_SHA256=//p' "$ROOT/.usine/incidents/erreurs.env")"
expect_match "le récepteur journalise ce qu'il reçoit (lisible dans Loki)" "Notification reçue" "$(kubectl -n monitoring logs deploy/receiver)"
usine incident erreurs clear >/dev/null && pass "usine incident erreurs clear (code 0)" || miss "usine incident erreurs clear (code 0)"
pod="$(kubectl -n "$NS" get pods -o jsonpath='{.items[0].metadata.name}')"
expect "clear : plus aucune panne sur les pods" '{"errorRate":0,"latencyMs":0}' \
  "$(kubectl -n "$NS" exec "$pod" -- node -e 'fetch("http://127.0.0.1:8080/fault",{headers:{"x-fault-token":process.env.FAULT_TOKEN}}).then(r=>r.text()).then(t=>process.stdout.write(t))')"

section "Idempotence et usine down monitoring"
uid_prom="$(pod_uid prometheus)"
usine up monitoring >/dev/null 2>&1 && pass "seconde exécution (code 0)" || miss "seconde exécution (code 0)"
expect "rien ne redémarre sans changement" "$uid_prom" "$(pod_uid prometheus)"
usine down monitoring >/dev/null 2>&1 && pass "usine down monitoring (code 0)" || miss "usine down monitoring (code 0)"
expect "l'espace de noms monitoring a disparu" "" "$(kubectl get namespace monitoring -o name 2>/dev/null || true)"
check "le cluster, lui, tourne toujours" kubectl get nodes
usine down monitoring >/dev/null 2>&1 && pass "seconde suppression (code 0)" || miss "seconde suppression (code 0)"

finish
