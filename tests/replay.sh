#!/usr/bin/env bash
# Rejeu de la chaîne de labs (ADR-0003, option B) — formateur et CI seulement, JAMAIS en séance :
# il remplace toute l'infrastructure du poste.
#
#   tests/replay.sh [lab…]          sans argument : tous les labs de .othila-lab/formation.json, dans l'ordre
#   USINE_REPLAY_DEFS=epreuve tests/replay.sh incident     définitions prises dans une référence Git (l'épreuve)
#
# Pour chaque lab : un clone du dépôt sur son départ (base ou la solution du lab précédent), puis sur sa solution
# (solution/<lab>). Dans chaque clone : définitions des labs reprises de l'arbre courant (comme lab update),
# usine down, usine rebuild, étapes de rejeu du lab (solution seulement), puis npx lab check <lab> --json --no-report,
# avec USINE_REPLAY=1 (checks distants neutralisés, ADR-0004).
#
# Règle : au départ, tout check du socle échoue (sauf passesOnStart) ; sur la solution, tout check du socle passe.
# Les étapes bonus (identifiant « bonus-… ») sont rapportées, pas exigées.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export USINE_REPLAY=1
WORK="$(mktemp -d "${TMPDIR:-/tmp}/usine-replay.XXXXXX")"
REPORT="$WORK/report.md"
LOGS="${USINE_REPLAY_LOGS:-$ROOT/.usine/replay}"
CHECK_TIMEOUT="${USINE_REPLAY_CHECK_TIMEOUT:-900}"
mkdir -p "$LOGS"
trap 'rm -rf "$WORK"' EXIT

ACT_VERSION=0.2.98

say() { printf '%s\n' "$*"; }
step() { printf '\n▶ %s\n' "$*"; }

# --- act (ADR-0006) : rejoue le workflow du lab pipeline-ci. Absent de l'image des étudiants : téléchargé ici. --
ensure_act() {
  command -v act >/dev/null 2>&1 && return 0
  local dir="$HOME/.cache/usine/act-$ACT_VERSION" arch
  if [[ ! -x "$dir/act" ]]; then
    case "$(uname -m)" in x86_64 | amd64) arch=x86_64 ;; aarch64 | arm64) arch=arm64 ;; *) return 1 ;; esac
    mkdir -p "$dir"
    curl -fsSL "https://github.com/nektos/act/releases/download/v$ACT_VERSION/act_Linux_$arch.tar.gz" | tar -xz -C "$dir" act || return 1
  fi
  export PATH="$dir:$PATH"
  # act 0.2.98 refuse les envois d'upload-artifact v6 : .othila-lab/shared/act.mjs joue v6 par cette copie de v4.
  [[ -d "$HOME/.cache/usine/upload-artifact-v4" ]] \
    || git clone --quiet --depth 1 --branch v4 https://github.com/actions/upload-artifact "$HOME/.cache/usine/upload-artifact-v4"
}

# --- Étapes de rejeu : ce que l'étudiant fait à la main et que usine rebuild ne refait pas ---------------------
replay_steps() {
  local lab="$1"
  case "$lab" in
    demarrage)
      (cd app && npm ci --no-audit --no-fund)
      ;;
    script)
      project/deploy/deploy.sh HEAD
      ;;
    livraison)
      # Le registre est distant : l'image du commit courant est construite ici, comme le ferait le pipeline.
      local sha
      sha="$(git rev-parse HEAD)"
      docker build --quiet --build-arg APP_VERSION=1.0.0 --build-arg APP_COMMIT="$sha" -t "reservations:$sha" app >/dev/null \
        && scripts/usine deploy test "reservations:$sha" \
        && git tag -f v1.0.0 HEAD >/dev/null
      ;;
    terraform)
      if [[ -f scripts/usine.d/incident.sh && -f infra/incidents/derive.sh ]]; then
        scripts/usine incident derive && terraform -chdir=project/infra apply -input=false -auto-approve >/dev/null
      fi
      ;;
    monitoring)
      # Comme l'étudiant : la panne, du trafic, puis une référence d'erreur lue dans les logs, recopiée au diagnostic.
      if [[ -f scripts/usine.d/incident.sh && -f infra/incidents/erreurs.sh ]]; then
        local url="${USINE_INGRESS_URL:-http://k3d-${USINE_CLUSTER:-usine}-serverlb}" ref
        scripts/usine incident erreurs
        for _ in $(seq 1 300); do curl -s -o /dev/null -m 2 "$url/api/sites" || true; done
        # La référence attendue est celle dont usine incident erreurs a noté l'empreinte ; à défaut, la première.
        local want refs
        want="$(sed -n 's/^ERROR_REF_SHA256=//p' .usine/incidents/erreurs.env 2>/dev/null || true)"
        refs="$(kubectl logs -l app.kubernetes.io/name=reservations --tail=-1 --max-log-requests=10 | grep -o 'ERR-[0-9A-F]\{8\}' | sort -u)"
        ref="$(head -n 1 <<<"$refs")"
        if [[ -n "$want" ]]; then
          ref="$(while read -r r; do [[ "$(printf '%s' "$r" | sha256sum | cut -d' ' -f1)" == "$want" ]] && echo "$r"; done <<<"$refs" | head -n 1)"
        fi
        [[ -n "$ref" ]] && printf -- '- %s\n' "$ref" >>project/monitoring/DIAGNOSTIC.md
      fi
      ;;
    *) : ;;
  esac
}

# Avant les checks, sur le départ comme sur la solution : ce que le lab suppose en cours (l'incident de l'épreuve).
before_checks() {
  local lab="$1"
  case "$lab" in
    incident)
      # Graine 1 : version-imposee, 10 jours, celle de solution/incident. L'incident reste actif pendant les checks.
      scripts/usine incident clear >/dev/null 2>&1 || true
      USINE_SEED=1 scripts/usine incident epreuve
      local ns
      ns="$(kubectl get deploy -A --field-selector metadata.name=reservations -o jsonpath='{.items[0].metadata.namespace}' 2>/dev/null)"
      kubectl rollout status deployment/reservations -n "${ns:-default}" --timeout=180s || true
      ;;
    *) : ;;
  esac
}

# --- Jouer un état -----------------------------------------------------------------------------------------------
# play <lab> <state> <tag> : écrit le JSON de lab check dans $WORK/<lab>-<state>.json ; journal dans $LOGS.
play() {
  local lab="$1" state="$2" tag="$3" clone="$WORK/$1-$2" log="$LOGS/$1-$2.log"
  : >"$log"
  if ! git clone --quiet --shared --no-checkout "$ROOT" "$clone" >>"$log" 2>&1 \
    || ! git -C "$clone" checkout --quiet --detach "$tag" >>"$log" 2>&1; then
    say "  clone sur $tag impossible (voir $log)"
    return 1
  fi
  # Les définitions des labs viennent de la référence du cours, jamais du tag (comme lab update).
  rm -rf "$clone/.othila-lab"
  mkdir -p "$clone/.othila-lab"
  if [[ -n "${USINE_REPLAY_DEFS:-}" ]]; then
    git -C "$ROOT" archive "$USINE_REPLAY_DEFS" .othila-lab | tar -x -C "$clone"
  else
    (cd "$ROOT/.othila-lab" && tar -c --exclude=./local .) | tar -x -C "$clone/.othila-lab"
  fi
  ln -s "$ROOT/node_modules" "$clone/node_modules"
  (
    cd "$clone" || exit 1
    echo "== usine rebuild ($tag)" >>"$log"
    scripts/usine rebuild >>"$log" 2>&1 || { echo "!! usine rebuild en échec" >>"$log"; exit 1; }
    if [[ "$state" == solution ]]; then
      echo "== étapes de rejeu ($lab)" >>"$log"
      replay_steps "$lab" >>"$log" 2>&1 || { echo "!! étapes de rejeu en échec" >>"$log"; exit 1; }
    fi
    before_checks "$lab" >>"$log" 2>&1 || { echo "!! préparation des checks en échec" >>"$log"; exit 1; }
  )
  local prepared=$?
  ((prepared == 0)) || say "  préparation en échec : les checks sont joués quand même (voir $log)"
  echo "== lab check $lab" >>"$log"
  (cd "$clone" && OTHILA_LAB_DIR="$WORK/state-$lab-$state" timeout "$CHECK_TIMEOUT" \
    npx --no-install lab check "$lab" --json --no-report </dev/null 2>>"$log" | tail -n 1) >"$WORK/$lab-$state.json"
  cat "$WORK/$lab-$state.json" >>"$log"
}

# --- Comparer à la règle ---------------------------------------------------------------------------------------
# verdict <lab> : lignes « état|étape|check|attendu|constaté|message » des checks hors règle, sur la sortie standard.
verdict() {
  local lab="$1" state file
  for state in start solution; do
    file="$WORK/$lab-$state.json"
    if ! jq -e '.results | length > 0' "$file" >/dev/null 2>&1; then
      echo "$state|-|lab check illisible|-|-|voir $LOGS/$lab-$state.log"
      continue
    fi
    jq -r --arg state "$state" '
      .results[] as $r
      | ($r.step | startswith("bonus-")) as $bonus
      | $r.checks[]
      | . as $c
      | ([$r.passed[] | select(. == $c.id)] | length > 0) as $passed
      | (if $state == "solution" then true else $c.passesOnStart end) as $expected
      | select(($bonus | not) and ($passed != $expected))
      | "\($state)|\($r.step)|\($c.id)|\(if $expected then "passe" else "échoue" end)|\(if $passed then "passe" else "échoue" end)|\(([$r.failed[] | select(.id == $c.id) | .message] | first // "") | gsub("\n"; " ") | .[0:300])"
    ' "$file"
  done
}

# Compte pour le rapport : checks du socle, distants, bonus passés sur la solution.
counts() {
  local lab="$1" file="$WORK/$1-solution.json"
  jq -r '
    [.results[] | select(.step | startswith("bonus-") | not) | .checks[]] as $socle
    | [.results[] | select(.step | startswith("bonus-")) | .checks[]] as $bonus
    | [.results[] | select(.step | startswith("bonus-")) | .passed[]] as $bonusOk
    | "\($socle | length) | \([$socle[] | select(.passesOnStart)] | length) | \($bonusOk | length)/\($bonus | length)"
  ' "$file" 2>/dev/null || echo "? | ? | ?"
}

# --- Chaîne ----------------------------------------------------------------------------------------------------
step "Définitions des labs (tests/definitions.test.mjs)"
[[ -n "${USINE_REPLAY_DEFS:-}" ]] || node --test "$ROOT/tests/definitions.test.mjs" >"$LOGS/definitions.log" 2>&1 \
  || { say "  ✗ définitions non conformes : $LOGS/definitions.log"; exit 1; }
say "  ✓ conformes"

# act sert au check du workflow (lab pipeline-ci), joué dans les clones : il doit être dans le PATH dès ici.
ensure_act || say "⚠ act introuvable et non téléchargeable : le check local du lab pipeline-ci échouera"

if [[ -n "${USINE_REPLAY_DEFS:-}" ]]; then
  mapfile -t chain < <(git -C "$ROOT" show "$USINE_REPLAY_DEFS:.othila-lab/formation.json" | jq -r '.seances[].labs[]')
else
  mapfile -t chain < <(jq -r '.seances[].labs[]' "$ROOT/.othila-lab/formation.json")
fi
if [[ $# -gt 0 ]]; then labs=("$@"); else labs=("${chain[@]}"); fi

start_of() {
  local lab="$1" prev=base item
  for item in "${chain[@]}"; do
    [[ "$item" == "$lab" ]] && { echo "$prev"; return 0; }
    prev="solution/$item"
  done
  return 1
}

{
  echo "# Rejeu de la chaîne — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "Dépôt : $(git -C "$ROOT" rev-parse --short HEAD) · journaux : $LOGS"
  echo
  echo "| Lab | Départ | Checks du socle | dont distants ou passesOnStart | Bonus verts sur la solution | Verdict |"
  echo "|---|---|---|---|---|---|"
} >"$REPORT"

failures=0
details=""
for lab in "${labs[@]}"; do
  start="$(start_of "$lab")" || { say "lab inconnu : $lab"; failures=$((failures + 1)); continue; }
  solution="solution/$lab"
  step "$lab : départ $start"
  if ! git -C "$ROOT" rev-parse --verify --quiet "$start^{commit}" >/dev/null; then
    say "  tag $start introuvable"
    echo "| $lab | $start | — | — | — | **tag de départ absent** |" >>"$REPORT"
    failures=$((failures + 1))
    continue
  fi
  if ! git -C "$ROOT" rev-parse --verify --quiet "$solution^{commit}" >/dev/null; then
    say "  tag $solution introuvable"
    echo "| $lab | $start | — | — | — | **solution absente** |" >>"$REPORT"
    failures=$((failures + 1))
    continue
  fi
  play "$lab" start "$start"
  step "$lab : solution $solution"
  play "$lab" solution "$solution"
  off="$(verdict "$lab")"
  if [[ -z "$off" ]]; then
    say "  ✓ conforme"
    echo "| $lab | $start | $(counts "$lab") | conforme |" >>"$REPORT"
  else
    say "  ✗ non conforme :"
    while IFS= read -r line; do say "    $line"; done <<<"$off"
    echo "| $lab | $start | $(counts "$lab") | **non conforme** |" >>"$REPORT"
    details+=$'\n'"### $lab"$'\n\n'"| État | Étape | Check | Attendu | Constaté | Message |"$'\n'"|---|---|---|---|---|---|"$'\n'"$(sed 's/^/| /; s/$/ |/' <<<"$off")"$'\n'
    failures=$((failures + 1))
  fi
done

step "Nettoyage : usine down"
# USINE_REBUILD_KEEP : cibles laissées en place (deux sessions de préparation sur le même démon Docker).
keep=" ${USINE_REBUILD_KEEP:-} "
mapfile -t clean < <(for f in "$ROOT"/scripts/usine.d/targets/*.sh; do t="$(basename "$f" .sh)"; [[ "$keep" == *" $t "* ]] || echo "$t"; done)
(cd "$ROOT" && scripts/usine down "${clean[@]}" >/dev/null 2>&1) || true

[[ -z "$details" ]] || printf '\n## Checks hors règle\n%s' "$details" >>"$REPORT"
cp "$REPORT" "$LOGS/report.md"
echo
cat "$REPORT"
((failures == 0))
