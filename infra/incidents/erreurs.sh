#!/usr/bin/env bash
# Incident du lab monitoring : une panne passagère. Une part des requêtes de l'API répond 500 pendant quelques
# minutes, sous un trafic généré dans le cluster ; puis tout rentre dans l'ordre de lui-même.
# Un ticket du support cite l'identifiant de la requête d'un usager : seule la lecture des logs donne la référence
# de l'erreur (error_ref), absente de la réponse HTTP.
#   usine incident erreurs          lance la panne (relancée : nouvelle panne, nouveau ticket)
#   usine incident erreurs clear    l'arrête tout de suite
# Réglages : USINE_ERREURS_RATE (part des requêtes en erreur, 0.3), USINE_ERREURS_DURATION (secondes, 300).
# Ce qui est noté dans .usine/incidents/erreurs.env : le ticket, l'identifiant de requête et l'empreinte SHA-256 de
# la référence de son erreur (pas la référence elle-même : elle se trouve dans les logs).
set -euo pipefail
# shellcheck source=../../scripts/usine.d/_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=../../scripts/usine.d/_cluster.sh
source "$USINE_D/_cluster.sh"
# shellcheck source=../../scripts/usine.d/_app.sh
source "$USINE_D/_app.sh"

RATE="${USINE_ERREURS_RATE:-0.3}"
DURATION="${USINE_ERREURS_DURATION:-300}"
NS=usine-incidents
STATE="$USINE_STATE/incidents/erreurs.env"
NODE_IMAGE=node:24.22.3-trixie-slim

require_cluster
mapfile -t pods < <(app_pods)

clear_faults() {
  local line
  kubectl -n "$NS" delete job erreurs --ignore-not-found --wait=false >/dev/null 2>&1 || true
  for line in "${pods[@]}"; do
    # shellcheck disable=SC2086 # « espace pod conteneur »
    app_call $line DELETE /fault >/dev/null 2>&1 || true
  done
}

if [[ "${1:-inject}" == clear ]]; then
  clear_faults
  rm -f "$STATE"
  ok "Incident « erreurs » arrêté : plus aucune panne injectée."
  exit 0
fi

[[ "${#pods[@]}" -gt 0 ]] || die "aucun pod de l'application ne tourne dans le cluster (image reservations:<version>) : rien à faire tomber."
read -r ns pod container <<<"${pods[0]}"
app_faults_enabled "$ns" "$pod" "$container" \
  || die "l'injection de pannes est désactivée : FAULT_TOKEN n'est pas défini dans le Deployment de l'application ($ns/$pod)."
token="$(kubectl -n "$ns" exec "$pod" -c "$container" -- printenv FAULT_TOKEN)"

# 1. La requête de l'usager : forcée en erreur, sur un pod, avec l'identifiant que citera le ticket.
request_id="support-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n' | tr 'a-f' 'A-F')"
ticket="SUP-$((RANDOM % 9000 + 1000))"
app_call "$ns" "$pod" "$container" POST /fault '{"errorRate":1}' >/dev/null || die "impossible d'injecter la panne dans $ns/$pod."
answer="$(app_call "$ns" "$pod" "$container" GET /api/reservations "" "$request_id" || true)"
[[ "$answer" == 500* ]] || die "la requête de l'usager n'a pas échoué comme prévu (réponse : ${answer:0:80})."
ref=""
for _ in 1 2 3 4 5; do
  ref="$(kubectl -n "$ns" logs "$pod" -c "$container" --since=5m 2>/dev/null \
    | jq -Rr --arg id "$request_id" 'fromjson? | select(.event == "fault_error" and .request_id == $id) | .error_ref' | tail -n 1)"
  [[ -n "$ref" ]] && break
  sleep 1
done
[[ -n "$ref" ]] || die "la référence de l'erreur n'apparaît pas dans les logs de $ns/$pod."

# 2. La panne de fond, sur tous les pods.
ips=()
for line in "${pods[@]}"; do
  # shellcheck disable=SC2086
  app_call $line POST /fault "{\"errorRate\":$RATE}" >/dev/null || die "impossible d'injecter la panne dans ${line% *}."
  read -r lns lpod _ <<<"$line"
  ips+=("$(kubectl -n "$lns" get pod "$lpod" -o jsonpath='{.status.podIP}')")
done

# 3. Le trafic, en Job dans le cluster : il cesse et retire les pannes au bout de DURATION secondes.
target=""
if svc="$(app_service_for "$ns" "$pod")" && [[ -n "$svc" ]]; then
  target="http://${svc% *}.$ns.svc.cluster.local:${svc#* }"
fi
cluster_import "$NODE_IMAGE" >/dev/null
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$NS" create configmap trafic --from-file=trafic.mjs="$USINE_ROOT/infra/incidents/trafic.mjs" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$NS" delete job erreurs --ignore-not-found --wait=true >/dev/null 2>&1 || true
kubectl -n "$NS" apply -f - >/dev/null <<YAML
apiVersion: batch/v1
kind: Job
metadata: { name: erreurs, labels: { app.kubernetes.io/part-of: usine } }
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 600
  activeDeadlineSeconds: $((DURATION + 120))
  template:
    metadata: { labels: { app.kubernetes.io/name: trafic, app.kubernetes.io/part-of: usine } }
    spec:
      restartPolicy: Never
      securityContext: { runAsUser: 1000, runAsGroup: 1000 }
      containers:
        - name: trafic
          image: $NODE_IMAGE
          imagePullPolicy: IfNotPresent
          command: [node, /app/trafic.mjs]
          env:
            - { name: TARGET, value: "$target" }
            - { name: PODS, value: "$(IFS=,; echo "${ips[*]}")" }
            - { name: TOKEN, value: "$token" }
            - { name: DURATION, value: "$DURATION" }
          resources: { requests: { cpu: 10m, memory: 32Mi }, limits: { memory: 96Mi } }
          volumeMounts: [{ name: code, mountPath: /app }]
      volumes: [{ name: code, configMap: { name: trafic } }]
YAML

mkdir -p "$(dirname "$STATE")"
printf 'TICKET=%s\nREQUEST_ID=%s\nERROR_REF_SHA256=%s\nSTARTED_AT=%s\nDURATION=%s\n' "$ticket" "$request_id" \
  "$(printf '%s' "$ref" | sha256sum | cut -d' ' -f1)" "$(date '+%Y-%m-%d %H:%M:%S')" "$DURATION" >"$STATE"

echo
echo "$(date '+%H:%M') — Ticket $ticket, transmis par l'accueil de la médiathèque centrale :"
echo "  « Une usagère n'arrive plus à consulter ses réservations depuis le portail. L'écran affichait"
echo "    « erreur interne » et un identifiant : $request_id. Plusieurs autres usagers se plaignent. »"
echo
info "(Panne simulée sur ${#pods[@]} pod(s) : elle cesse d'elle-même dans $((DURATION / 60)) min. « usine incident erreurs clear » l'arrête.)"
