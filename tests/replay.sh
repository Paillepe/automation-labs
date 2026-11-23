#!/usr/bin/env bash
# Rejeu de la chaîne de labs (ADR-0003, option B) — formateur et CI seulement, JAMAIS en séance :
# il remplace toute l'infrastructure du poste.
#
#   tests/replay.sh [lab…]          sans argument : tous les labs de .othila-lab/formation.json, dans l'ordre
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
}

# --- Étapes de rejeu : ce que l'étudiant fait à la main et que usine rebuild ne refait pas ---------------------
replay_steps() {
  local lab="$1"
  case "$lab" in
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
  (cd "$ROOT/.othila-lab" && tar -c --exclude=./local .) | tar -x -C "$clone/.othila-lab"
  ln -s "$ROOT/node_modules" "$clone/node_modules"
  (
    cd "$clone" || exit 1
    echo "== usine rebuild ($tag)" >>"$log"
    scripts/usine rebuild >>"$log" 2>&1 || { echo "!! usine rebuild en échec" >>"$log"; exit 1; }
    if [[ "$state" == solution ]]; then
      echo "== étapes de rejeu ($lab)" >>"$log"
      replay_steps "$lab" >>"$log" 2>&1 || { echo "!! étapes de rejeu en échec" >>"$log"; exit 1; }
    fi
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
# act sert au check du workflow (lab pipeline-ci), joué dans les clones : il doit être dans le PATH dès ici.
ensure_act || say "⚠ act introuvable et non téléchargeable : le check local du lab pipeline-ci échouera"

mapfile -t chain < <(jq -r '.seances[].labs[]' "$ROOT/.othila-lab/formation.json")
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
(cd "$ROOT" && scripts/usine down >/dev/null 2>&1) || true

[[ -z "$details" ]] || printf '\n## Checks hors règle\n%s' "$details" >>"$REPORT"
cp "$REPORT" "$LOGS/report.md"
echo
cat "$REPORT"
((failures == 0))
