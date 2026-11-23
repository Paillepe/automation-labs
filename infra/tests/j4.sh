#!/usr/bin/env bash
# Mesure mémoire de la configuration du J4 (SPEC §3.2, cible ≤ 4 Go) : cluster, base, 3 réplicas de l'application
# sous trafic (5 requêtes/s), stack de monitoring complète avec règles, routage et tableau de bord.
#   infra/tests/j4.sh [minutes, 30 par défaut]
# Relevés docker stats à 5, 10, 20 et 30 minutes (ou à la fin), puis la répartition par pod. Nettoie derrière lui.
# Ne compte pas le devcontainer ni VS Code. ATTENTION : remplace le cluster du poste. Jamais pendant une séance.
set -euo pipefail
source "$(dirname "$0")/_lib.sh"
export USINE_ROOT="$ROOT" USINE_D="$ROOT/scripts/usine.d"
# shellcheck source=../../scripts/usine.d/_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=../../scripts/usine.d/_cluster.sh
source "$USINE_D/_cluster.sh"

MINUTES="${1:-30}"
PROJECT="$(mktemp -d)"
export USINE_MONITORING_DIR="$PROJECT"
NS=usine-t-j4
usine() { "$ROOT/scripts/usine" "$@"; }
cleanup() {
  usine down cluster >/dev/null 2>&1 || true
  rm -rf "$PROJECT"
}
trap cleanup EXIT

mkdir -p "$PROJECT/rules" "$PROJECT/dashboards"
cat >"$PROJECT/rules/alertes.yml" <<'EOF'
groups:
  - name: reservations
    rules:
      - alert: HighErrorRate
        expr: sum(rate(http_requests_total{job="reservations",status=~"5.."}[1m])) / sum(rate(http_requests_total{job="reservations"}[1m])) > 0.05
        for: 1m
      - alert: HighCpuUsage
        expr: sum by (pod) (rate(container_cpu_usage_seconds_total{container="reservations"}[2m])) > 0.8
        for: 2m
      - alert: HighMemoryUsage
        expr: max by (pod) (container_memory_working_set_bytes{container="reservations"} / container_spec_memory_limit_bytes{container="reservations"}) > 0.9
        for: 2m
EOF
cat >"$PROJECT/alertmanager.yml" <<'EOF'
route: { receiver: equipe, group_wait: 10s }
receivers:
  - name: equipe
    webhook_configs: [{ url: http://receiver.monitoring.svc:8080/alertmanager }]
EOF
cat >"$PROJECT/dashboards/reservations.json" <<'EOF'
{ "uid": "reservations", "title": "Réservations", "panels": [ { "id": 1, "type": "timeseries", "title": "Requêtes",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "targets": [ { "refId": "A", "expr": "sum by (status) (rate(http_requests_total[1m]))" } ] } ] }
EOF

stats() {
  docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' | grep -E "^k3d-$USINE_CLUSTER-" | sed 's/^/  /'
  docker exec "$USINE_CLUSTER_NODE" sh -c 'awk "/MemAvailable|SwapTotal|SwapFree/ { printf \"  %s %d Mio\n\", \$1, \$2/1024 }" /proc/meminfo'
}

section "Mise en place"
usine down cluster >/dev/null 2>&1 || true
usine up monitoring >/dev/null
usine release 1.0.0 --local >/dev/null
kubectl create namespace "$NS" >/dev/null
kubectl -n "$NS" create deployment reservations --image=reservations:1.0.0 --replicas=3 --port=8080 >/dev/null
kubectl -n "$NS" set env deploy/reservations FAULT_TOKEN=lab-fault-token DB_HOST=db.data DB_PASSWORD=lab-cluster-password >/dev/null
kubectl -n "$NS" set resources deploy/reservations --limits=memory=192Mi --requests=cpu=50m,memory=64Mi >/dev/null
kubectl -n "$NS" expose deploy/reservations --port=80 --target-port=8080 >/dev/null
kubectl -n "$NS" rollout status deploy/reservations --timeout=180s >/dev/null
kubectl -n "$NS" create configmap trafic --from-file=trafic.mjs="$ROOT/infra/incidents/trafic.mjs" >/dev/null
kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: batch/v1
kind: Job
metadata: { name: trafic }
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: trafic
          image: node:24.22.3-trixie-slim
          imagePullPolicy: IfNotPresent
          command: [node, /app/trafic.mjs]
          env:
            - { name: TARGET, value: "http://reservations.$NS.svc.cluster.local" }
            - { name: DURATION, value: "$((MINUTES * 60 + 60))" }
          volumeMounts: [{ name: code, mountPath: /app }]
      volumes: [{ name: code, configMap: { name: trafic } }]
EOF
pass "cluster, base, 3 réplicas, stack complète, trafic à 5 requêtes/s pendant $MINUTES min"
echo "  $(date '+%H:%M:%S') — départ"

elapsed=0
for mark in 5 10 20 30; do
  ((mark <= MINUTES)) || continue
  sleep $(((mark - elapsed) * 60))
  elapsed=$mark
  section "Au bout de $mark min ($(date '+%H:%M:%S'))"
  stats
done
if ((elapsed < MINUTES)); then
  sleep $(((MINUTES - elapsed) * 60))
  section "Au bout de $MINUTES min"
  stats
fi

section "Répartition par pod (working set)"
docker exec "$USINE_CLUSTER_NODE" crictl stats -o json | jq -r '.stats[]
  | [(.attributes.labels["io.kubernetes.pod.namespace"] + "/" + .attributes.labels["io.kubernetes.container.name"]),
     ((.memory.workingSetBytes.value // "0" | tonumber) / 1048576 | floor)] | "  \(.[1]) Mio\t\(.[0])"' | sort -rn
section "Preuves que tout tournait"
kubectl get --raw '/api/v1/namespaces/monitoring/services/prometheus:9090/proxy/api/v1/query?query=sum(http_requests_total%7Bjob%3D%22reservations%22%7D)' \
  | jq -r '"  requêtes servies (Prometheus) : \(.data.result[0].value[1] // "?")"'
kubectl get --raw '/api/v1/namespaces/monitoring/services/prometheus:9090/proxy/api/v1/query?query=prometheus_tsdb_head_series' \
  | jq -r '"  séries dans Prometheus : \(.data.result[0].value[1] // "?")"'
kubectl -n "$NS" get pods --no-headers | sed 's/^/  /'
finish
