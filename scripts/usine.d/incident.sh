#!/usr/bin/env bash
# usine: Lance un incident : usine incident <nom> · usine incident clear (clôt l'épreuve) · usine incident status
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"

# Deux familles (SPEC §6.4) :
#   incidents de lab   infra/incidents/<nom>.sh        (derive, erreurs) : altèrent l'état en cours, rien n'est noté
#   épreuve            .othila-lab/incidents/<nom>.sh  (livrée par « npx lab update ») : notée dans .usine/incident,
#                      réinjectée à la fin de « usine rebuild » (usine incident resume), close par « usine incident clear »
# USINE_INCIDENTS_DIR ajoute un dossier où chercher les incidents de la seconde famille (essais du formateur).
#
# Contrat d'un script d'incident : il reçoit l'action en premier argument (inject, reinject ou clear) ; il est
# idempotent, ne modifie jamais project/, affiche un message réaliste. Ce qu'une épreuve change du côté fourni
# et qui doit survivre à un cluster recréé va dans .usine/provided/ (relu par « usine up cluster », voir _cluster.sh). Variables fournies : USINE_ROOT, USINE_D,
# USINE_STATE (dossier .usine/), USINE_INCIDENT_SEED (graine de l'épreuve : le scénario en dépend).

USINE_STATE="${USINE_STATE:-$USINE_ROOT/.usine}"
STATE_FILE="$USINE_STATE/incident"
export USINE_STATE

usage() {
  cat <<'EOF'
Usage : usine incident <nom>          lance l'incident (derive, erreurs ; epreuve le vendredi)
        usine incident <nom> clear    retire un incident de lab
        usine incident clear          clôt l'épreuve en cours
        usine incident status         dit si une épreuve est en cours
EOF
}

# Où est le script de l'incident ? Écrit « <famille> <chemin> », ou rien.
locate() {
  local name="$1" dir
  if [[ -f "$USINE_ROOT/infra/incidents/$name.sh" ]]; then
    echo "lab $USINE_ROOT/infra/incidents/$name.sh"
    return
  fi
  for dir in "$USINE_ROOT/.othila-lab/incidents" ${USINE_INCIDENTS_DIR:+"$USINE_INCIDENTS_DIR"}; do
    if [[ -f "$dir/$name.sh" ]]; then
      echo "epreuve $dir/$name.sh"
      return
    fi
  done
}

# Graine de l'épreuve : USINE_SEED, sinon dérivée du dépôt de l'étudiant (son fork), pour que deux voisins
# n'aient pas le même scénario et que le même poste retrouve toujours le sien.
seed() {
  if [[ -n "${USINE_SEED:-}" ]]; then
    [[ "$USINE_SEED" =~ ^[0-9]+$ ]] || die "USINE_SEED doit être un entier."
    echo "$USINE_SEED"
    return
  fi
  local origin
  origin="$(git -C "$USINE_ROOT" remote get-url origin 2>/dev/null || hostname)"
  printf '%s' "${origin,,}" | cksum | cut -d' ' -f1
}

state_get() {
  [[ -f "$STATE_FILE" ]] || return 0
  sed -n "s/^$1=//p" "$STATE_FILE" | head -n 1
}

run_script() {
  local script="$1" action="$2" seed_value="${3:-}"
  USINE_INCIDENT_SEED="$seed_value" bash "$script" "$action"
}

[[ $# -gt 0 ]] || {
  usage >&2
  exit 2
}
name="$1"
action="${2:-inject}"

case "$name" in
  -h | --help | help)
    usage
    exit 0
    ;;
  status)
    if [[ -f "$STATE_FILE" ]]; then
      info "Épreuve en cours : $(state_get NAME), lancée le $(state_get STARTED_AT)."
      info "Elle est réinjectée à la fin de chaque « usine rebuild ». « usine incident clear » la clôt."
    else
      info "Aucune épreuve en cours."
    fi
    exit 0
    ;;
  resume | reinject)
    # Appelé par « usine rebuild », en dernier : remet l'épreuve en place si elle est en cours, sinon ne fait rien.
    [[ -f "$STATE_FILE" ]] || exit 0
    active="$(state_get NAME)"
    found="$(locate "$active")"
    if [[ -z "$found" ]]; then
      warn "Épreuve « $active » en cours, mais son script est introuvable : « npx lab update », puis « usine incident $active »."
      exit 1
    fi
    title "Épreuve en cours : réinjection"
    run_script "${found#* }" resume "$(state_get SEED)"
    exit 0
    ;;
  clear)
    if [[ ! -f "$STATE_FILE" ]]; then
      ok "Aucune épreuve en cours."
      exit 0
    fi
    active="$(state_get NAME)"
    found="$(locate "$active")"
    [[ -z "$found" ]] || run_script "${found#* }" clear "$(state_get SEED)"
    rm -f "$STATE_FILE"
    ok "Épreuve « $active » close : « usine rebuild » ne la réinjectera plus."
    exit 0
    ;;
esac

[[ "$name" =~ ^[a-z][a-z0-9-]*$ ]] || die "nom d'incident invalide « $name »."
[[ "$action" == inject || "$action" == clear ]] || die "action inconnue « $action » (clear, ou rien pour lancer l'incident)."
found="$(locate "$name")"
if [[ -z "$found" ]]; then
  if [[ "$name" == epreuve ]]; then
    die "l'épreuve n'est pas encore distribuée : elle arrive le vendredi par « npx lab update »."
  fi
  die "incident inconnu « $name » (incidents de lab : $(find "$USINE_ROOT/infra/incidents" -maxdepth 1 -name '*.sh' -exec basename {} .sh \; 2>/dev/null | sort | tr '\n' ' '))."
fi
family="${found%% *}"
script="${found#* }"

if [[ "$family" == lab ]]; then
  run_script "$script" "$action"
  exit 0
fi

# Épreuve. Une seule à la fois ; relancée, elle garde sa graine : même scénario, même message.
if [[ "$action" == clear ]]; then
  exec bash "$USINE_D/incident.sh" clear
fi
if [[ -f "$STATE_FILE" && "$(state_get NAME)" != "$name" ]]; then
  die "une autre épreuve est en cours ($(state_get NAME)) : « usine incident clear » d'abord."
fi
seed_value="$(state_get SEED)"
[[ -n "$seed_value" ]] || seed_value="$(seed)"
started="$(state_get STARTED_AT)"
[[ -n "$started" ]] || started="$(date '+%Y-%m-%d %H:%M:%S')"
# Noté avant d'injecter : même interrompue, l'épreuve est en cours, et « usine rebuild » la remettra en place.
mkdir -p "$USINE_STATE"
printf 'NAME=%s\nSEED=%s\nSTARTED_AT=%s\n' "$name" "$seed_value" "$started" >"$STATE_FILE"
run_script "$script" inject "$seed_value"
