#!/usr/bin/env bash
# Test autonome de « usine release » (couture C1). À lancer dans le devcontainer.
# Un registre local (image registry, pour ce test seulement) joue le rôle de GHCR : on y publie ce que publierait
# le pipeline de l'étudiant. Vérifie : image tirée du registre et chargée sous reservations:<version>, /version
# renvoie le SHA du pipeline à travers l'Ingress ; étiquette v<version> acceptée ; repli local annoncé (image absente,
# registre injoignable, rejeu) ; idempotence ; pods à redémarrer signalés. Nettoie derrière lui.
# ATTENTION : utilise le cluster du poste (le crée s'il manque, et le supprime alors à la fin).
# shellcheck disable=SC2015 # « commande && pass … || miss … » : pass rend toujours 0
set -euo pipefail
source "$(dirname "$0")/_lib.sh"
export USINE_ROOT="$ROOT" USINE_D="$ROOT/scripts/usine.d"
# shellcheck source=../../scripts/usine.d/_lib.sh
source "$USINE_D/_lib.sh"
# shellcheck source=../../scripts/usine.d/_cluster.sh
source "$USINE_D/_cluster.sh"

REGISTRY_IMAGE_REF="registry:3.0.0"
REGISTRY_PORT=15000
REPO="localhost:$REGISTRY_PORT/eleve/automation-labs"
PIPELINE_SHA="$(printf 'pipeline-de-l-eleve' | sha1sum | cut -c1-40)"
NS=usine-t-release
HOST=release.usine-t
HAD_CLUSTER=0
cluster_exists && HAD_CLUSTER=1

usine() { "$ROOT/scripts/usine" "$@"; }
cleanup() {
  kubectl delete namespace "$NS" --wait=false >/dev/null 2>&1 || true
  docker rm -f usine-t-registry >/dev/null 2>&1 || true
  docker image rm "$REPO:1.0.0" "$REPO:v1.1.0" reservations:1.0.0 reservations:1.1.0 reservations:1.2.0 reservations:9.9.9 >/dev/null 2>&1 || true
  rm -f "$ROOT/.usine/releases/1.0.0" "$ROOT/.usine/releases/1.1.0" "$ROOT/.usine/releases/1.2.0" "$ROOT/.usine/releases/9.9.9"
  if [[ "$HAD_CLUSTER" == 0 ]]; then usine down cluster >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

web() { curl -s -m 5 -H "Host: $HOST" "$(cluster_http)$1"; }
web_ok() { curl -fs -m 5 -o /dev/null -H "Host: $HOST" "$(cluster_http)$1"; }
release() { USINE_REGISTRY_IMAGE="$REPO" usine release "$@" 2>&1; }

section "Préparation : cluster, registre local, image publiée « par le pipeline »"
usine up cluster >/dev/null 2>&1 && pass "cluster démarré" || miss "cluster démarré"
docker run -d --name usine-t-registry -p "127.0.0.1:$REGISTRY_PORT:5000" "$REGISTRY_IMAGE_REF" >/dev/null 2>&1
wait_for 20 curl -fsS "http://127.0.0.1:$REGISTRY_PORT/v2/" || docker exec usine-t-registry true
build_app "$REPO:1.0.0" 1.0.0 "$PIPELINE_SHA"
build_app "$REPO:v1.1.0" 1.1.0 "$PIPELINE_SHA"
docker push --quiet "$REPO:1.0.0" >/dev/null && docker push --quiet "$REPO:v1.1.0" >/dev/null && pass "1.0.0 et v1.1.0 publiées" || miss "publication dans le registre local"
docker image rm "$REPO:1.0.0" "$REPO:v1.1.0" reservations:1.0.0 reservations:1.1.0 >/dev/null 2>&1 || true

section "usine release 1.0.0 : depuis le registre"
out="$(release 1.0.0)" && pass "code 0" || miss "code 0 — $(tail -n 3 <<<"$out")"
expect_match "annonce l'image du registre" "Image de ton registre : $REPO:1.0.0" "$out"
expect "source notée dans .usine/releases" registry "$(sed -n 's/^SOURCE=//p' "$ROOT/.usine/releases/1.0.0")"
expect "le cluster a exactement l'image tirée" "$(docker image inspect "$REPO:1.0.0" --format '{{.Id}}')" "$(node_image_id reservations:1.0.0)"

kubectl create namespace "$NS" >/dev/null
kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: apps/v1
kind: Deployment
metadata: { name: app }
spec:
  replicas: 1
  selector: { matchLabels: { app: app } }
  template:
    metadata: { labels: { app: app } }
    spec:
      containers:
        - name: app
          image: reservations:1.0.0
          imagePullPolicy: Never
          env:
            - { name: DB_HOST, value: db.data }
            - { name: DB_PASSWORD, value: lab-cluster-password }
          readinessProbe: { httpGet: { path: /ready, port: 8080 }, periodSeconds: 2 }
---
apiVersion: v1
kind: Service
metadata: { name: app }
spec: { selector: { app: app }, ports: [{ port: 80, targetPort: 8080 }] }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: app }
spec:
  rules:
    - host: $HOST
      http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: app, port: { number: 80 } } } }] }
EOF
kubectl -n "$NS" rollout status deploy/app --timeout=120s >/dev/null && pass "un Deployment démarre sur reservations:1.0.0" || miss "un Deployment démarre sur reservations:1.0.0"
wait_for 30 web_ok /ready || true
expect "par l'Ingress, /version renvoie le SHA du pipeline" "{\"service\":\"reservations\",\"version\":\"1.0.0\",\"commit\":\"$PIPELINE_SHA\"}" "$(web /version)"
expect "/ready est vert (db.data)" '{"status":"ready"}' "$(web /ready)"

section "Idempotence"
out="$(release 1.0.0)" && pass "seconde exécution (code 0)" || miss "seconde exécution (code 0)"
expect_match "rien à réimporter" "déjà présentes dans le cluster" "$out"
expect_match "« v1.0.0 » vaut « 1.0.0 »" "Version 1.0.0 → reservations:1.0.0" "$(release v1.0.0)"

section "Étiquette v<version> (tag Git poussé tel quel)"
out="$(release 1.1.0)" && pass "code 0" || miss "code 0 — $(tail -n 3 <<<"$out")"
expect_match "trouve $REPO:v1.1.0" "Image de ton registre : $REPO:v1.1.0" "$out"

section "Replis : construction locale annoncée"
out="$(release 1.2.0)" && pass "version absente du registre : code 0" || miss "version absente du registre : code 0"
expect_match "le repli est annoncé" "construite en local" "$out"
expect "source notée : local" local "$(sed -n 's/^SOURCE=//p' "$ROOT/.usine/releases/1.2.0")"
expect "l'image locale porte la version demandée" "APP_VERSION=1.2.0" "$(docker image inspect reservations:1.2.0 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep ^APP_VERSION=)"
out="$(USINE_REGISTRY_IMAGE=localhost:15999/personne/rien usine release 9.9.9 2>&1)" && pass "registre injoignable : code 0" || miss "registre injoignable : code 0"
expect_match "le repli est annoncé" "construite en local" "$out"
out="$(USINE_REPLAY=1 release 1.2.0)"
expect_match "rejeu : construction locale sans essayer le registre" "rejeu : pas de registre" "$out"
expect "rejeu : aucun téléchargement tenté" "" "$(grep 'Téléchargement' <<<"$out" || true)"

section "Une image remplacée sous le même nom : les pods à redémarrer sont signalés"
out="$(release 1.0.0 --local)"
expect_match "les pods qui tournent sur l'ancienne image sont nommés" "$NS/app-" "$out"
kubectl -n "$NS" rollout restart deploy/app >/dev/null && kubectl -n "$NS" rollout status deploy/app --timeout=120s >/dev/null
local_commit="$(git -C "$ROOT" rev-parse HEAD)"
got=""
for _ in $(seq 30); do
  got="$(web /version || true)"
  grep -q "\"commit\":\"$local_commit\"" <<<"$got" && break
  sleep 1
done
expect_match "après redémarrage, /version renvoie le commit local" "\"commit\":\"$local_commit\"" "$got"

section "Erreurs"
set +e
out="$(usine release pas-une-version 2>&1)"
rc=$?
set -e
expect "version invalide : code 1" 1 "$rc"
expect_match "message explicite" "version invalide" "$out"
if [[ ! -d "$ROOT/project/k8s" ]]; then
  set +e
  usine release >/dev/null 2>&1
  rc=$?
  set -e
  expect "sans argument ni manifests : code 2 (usage)" 2 "$rc"
fi

finish
