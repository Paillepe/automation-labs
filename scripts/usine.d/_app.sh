#!/usr/bin/env bash
# L'application de l'étudiant dans le cluster, vue par les incidents (flux Fournitures).
# À sourcer après _lib.sh et _cluster.sh : source "$USINE_D/_app.sh"
#
# L'application se reconnaît à son image, reservations:<version> (« usine release »), quel que soit l'espace de noms
# ou le nom du Deployment choisi par l'étudiant. Les appels passent par « kubectl exec » et le Node.js de l'image :
# le jeton des pannes est lu dans l'environnement du pod (FAULT_TOKEN), jamais deviné.

APP_IMAGE_REGEX='^(docker\.io/library/)?reservations:'

# Pods de l'application qui tournent (ni en attente, ni en cours d'arrêt) : « espace pod conteneur » par ligne.
app_pods() {
  kubectl get pods -A -o json 2>/dev/null | jq -r --arg re "$APP_IMAGE_REGEX" '
    .items[]
    | select(.status.phase == "Running" and .metadata.deletionTimestamp == null)
    | . as $p
    | .spec.containers[]
    | select(.image | test($re))
    | "\($p.metadata.namespace) \($p.metadata.name) \(.name)"'
}

# app_call <espace> <pod> <conteneur> <méthode> <chemin> [corps JSON] [identifiant de requête]
# Écrit « <statut HTTP> <corps> ». En-têtes : X-Fault-Token (depuis l'environnement du pod), X-Request-Id.
app_call() {
  local ns="$1" pod="$2" container="$3"
  shift 3
  # shellcheck disable=SC2016 # le code JavaScript est passé tel quel à node
  kubectl -n "$ns" exec "$pod" -c "$container" -- node -e '
    const [method, path, body, requestId] = process.argv.slice(1);
    const headers = { "content-type": "application/json", "x-fault-token": process.env.FAULT_TOKEN || "" };
    if (requestId) headers["x-request-id"] = requestId;
    fetch(`http://127.0.0.1:${process.env.PORT || 8080}${path}`, { method, headers, body: body || undefined })
      .then(async (r) => process.stdout.write(`${r.status} ${await r.text()}`))
      .catch((e) => { process.stderr.write(e.message); process.exit(1); });
  ' "$@"
}

# Les pannes sont-elles activables sur ce pod (FAULT_TOKEN défini) ?
app_faults_enabled() {
  [[ -n "$(kubectl -n "$1" exec "$2" -c "$3" -- printenv FAULT_TOKEN 2>/dev/null)" ]]
}

# Service (« nom port ») qui mène à un pod, d'après les EndpointSlices ; vide s'il n'y en a pas.
# Le port est celui du Service (une EndpointSlice ne donne que celui du pod).
app_service_for() {
  local ns="$1" pod="$2" svc port
  svc="$(kubectl -n "$ns" get endpointslices -o json 2>/dev/null | jq -r --arg pod "$pod" '
    [.items[] | select(any(.endpoints[]?; .targetRef.name == $pod)) | .metadata.labels["kubernetes.io/service-name"]][0] // empty')"
  [[ -n "$svc" ]] || return 0
  port="$(kubectl -n "$ns" get service "$svc" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null)"
  [[ -n "$port" ]] && echo "$svc $port"
}
