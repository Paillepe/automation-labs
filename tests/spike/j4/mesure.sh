#!/usr/bin/env bash
# Spike mémoire J4 : déploie le gabarit sur le cluster « spike », envoie du trafic, mesure.
#   tests/spike/run.sh k3d && tests/spike/j4/mesure.sh [minutes de trafic, 4 par défaut]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export KUBECONFIG="$HOME/.kube/spike"
minutes="${1:-4}"

kubectl delete deploy,svc,ingress whoami --ignore-not-found >/dev/null
kubectl apply -f "$HERE/stack.yaml" >/dev/null
for d in app db prometheus alertmanager grafana loki alloy; do
  kubectl -n spike-j4 rollout status "deploy/$d" --timeout=600s
done

echo "Trafic pendant $minutes min (10 requêtes par seconde) : métriques et journaux s'accumulent…"
end=$((SECONDS + minutes * 60))
while [[ $SECONDS -lt $end ]]; do
  curl -s -o /dev/null -m 2 -H 'Host: app.spike' http://k3d-spike-serverlb/ || true
  sleep 0.1
done

echo "== docker stats (ce que le poste paie)"
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' | grep -E '^(k3d-spike|spike-)' || true
echo "== kubectl top pods (répartition dans le cluster)"
kubectl top pods -A --sort-by=memory || true
echo "== nœud"
kubectl top node || true
echo "== preuves : cibles Prometheus up, journaux dans Loki"
kubectl -n spike-j4 exec deploy/prometheus -- wget -qO- 'http://localhost:9090/api/v1/query?query=count(up==1)by(job)' || true
echo
kubectl -n spike-j4 exec deploy/prometheus -- wget -qO- 'http://loki:3100/loki/api/v1/query?query=count_over_time({app="app"}[5m])' | head -c 600 || true
echo
