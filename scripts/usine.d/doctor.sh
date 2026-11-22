#!/usr/bin/env bash
# usine: Vérifie que le poste est prêt pour le cours (Docker, mémoire, disque, GitHub, images)
set -euo pipefail
# shellcheck source=_lib.sh
source "$USINE_D/_lib.sh"

# Seuils. La mémoire est celle que Docker peut utiliser, pas celle du poste.
MEM_MIN_MB="${USINE_DOCTOR_MEM_MIN_MB:-3500}"   # Docker Desktop réglé à 4 Go annonce 3,8 Gio
DISK_MIN_GB="${USINE_DOCTOR_DISK_MIN_GB:-8}"
DISK_REC_GB="${USINE_DOCTOR_DISK_REC_GB:-15}"
CPU_MIN=2
CPU_REC=4

failures=0
warnings=0
bad() {
  fail "$1"
  failures=$((failures + 1))
}
meh() {
  warn "$1"
  warnings=$((warnings + 1))
}

echo "usine doctor — vérification du poste"

title "Environnement"
if [[ -n "${CODESPACES:-}" ]]; then
  ok "GitHub Codespaces"
elif [[ -n "${REMOTE_CONTAINERS:-}" || -f /.dockerenv ]]; then
  ok "Devcontainer"
else
  meh "Tu n'es pas dans le devcontainer : les outils du cours ne sont pas garantis"
  hint "Dans VS Code : palette de commandes, « Dev Containers: Reopen in Container »"
fi

title "Outils"
missing_tools=()
for tool in git node npm docker gh terraform ansible-playbook ansible-lint kubectl k3d jq curl ssh shellcheck actionlint; do
  command -v "$tool" >/dev/null 2>&1 || missing_tools+=("$tool")
done
if [[ "${#missing_tools[@]}" -eq 0 ]]; then
  ok "Tous les outils du cours sont installés"
else
  bad "Outils introuvables : ${missing_tools[*]}"
  hint "Reconstruis l'environnement : « Dev Containers: Rebuild Container »"
fi
if docker compose version >/dev/null 2>&1; then
  ok "Plugin docker compose"
else
  bad "Le plugin « docker compose » ne répond pas"
fi

title "Docker"
if ! docker_ok; then
  bad "Docker ne répond pas"
  hint "Lance Docker Desktop (macOS, Windows) ou le service docker (Linux), attends qu'il soit prêt, recommence"
  hint "Windows : Docker Desktop doit utiliser le moteur WSL 2 (Settings > General)"
  echo
  echo "Résultat : poste non prêt. Le reste des vérifications a besoin de Docker."
  exit 1
fi
read -r docker_version docker_arch docker_cpus docker_mem docker_os < <(
  docker info --format '{{.ServerVersion}} {{.Architecture}} {{.NCPU}} {{.MemTotal}} {{.OperatingSystem}}'
)
ok "Docker $docker_version ($docker_arch) — $docker_os"

mem_mb=$((docker_mem / 1024 / 1024))
mem_txt="$(awk -v m="$mem_mb" 'BEGIN { printf "%.1f", m / 1024 }' | tr . ,) Go"
# Mesuré au spike : la configuration la plus lourde (J4) occupe environ 1,3 Gio, 4 Go suffisent.
if [[ "$mem_mb" -lt "$MEM_MIN_MB" ]]; then
  bad "Mémoire allouée à Docker : $mem_txt — il en faut au moins 4 Go"
  hint "macOS : Docker Desktop > Settings > Resources > Memory"
  hint "Windows : fichier .wslconfig, puis « wsl --shutdown » (voir docs/AVANT-LE-COURS.md)"
else
  ok "Mémoire allouée à Docker : $mem_txt"
fi

if [[ "$docker_cpus" -lt "$CPU_MIN" ]]; then
  bad "Processeurs alloués à Docker : $docker_cpus — il en faut au moins $CPU_MIN"
elif [[ "$docker_cpus" -lt "$CPU_REC" ]]; then
  meh "Processeurs alloués à Docker : $docker_cpus — $CPU_REC conseillés"
else
  ok "Processeurs alloués à Docker : $docker_cpus"
fi

# Dans le devcontainer, « / » est posé sur le disque de Docker : c'est bien l'espace dont les images disposent.
disk_gb=$(($(df -Pk / | awk 'NR == 2 { print $4 }') / 1024 / 1024))
if [[ "$disk_gb" -lt "$DISK_MIN_GB" ]]; then
  bad "Espace disque libre pour Docker : $disk_gb Go — il en faut au moins $DISK_MIN_GB"
  hint "Fais de la place : « docker system prune » supprime ce qui ne sert plus (conteneurs arrêtés, images orphelines)"
elif [[ "$disk_gb" -lt "$DISK_REC_GB" ]]; then
  meh "Espace disque libre pour Docker : $disk_gb Go — $DISK_REC_GB Go conseillés"
else
  ok "Espace disque libre pour Docker : $disk_gb Go"
fi

title "Dépôt"
# Un dépôt cloné sur le disque Windows (C:\ ou /mnt/c) est lent et perd les droits des fichiers : il doit vivre dans WSL.
case "${LOCAL_WORKSPACE_FOLDER:-}" in
  [A-Za-z]:\\* | /mnt/[a-z]/* | /run/desktop/mnt/host/[a-z]/*)
    bad "Le dépôt est sur le disque Windows ($LOCAL_WORKSPACE_FOLDER)"
    hint "Clone-le dans WSL (terminal Ubuntu, dossier ~/), puis rouvre-le : voir docs/AVANT-LE-COURS.md"
    ;;
  *) ok "Emplacement du dépôt" ;;
esac
if [[ -d "$USINE_ROOT/node_modules/@othila-academy/lab" ]]; then
  ok "othila-lab est installé (npx lab)"
else
  meh "othila-lab n'est pas installé"
  hint "Lance « npm ci » à la racine du dépôt"
fi

title "GitHub"
if ! command -v gh >/dev/null 2>&1; then
  bad "gh est introuvable"
elif gh auth status --hostname github.com >/dev/null 2>&1; then
  login="$(gh api user --jq .login 2>/dev/null || true)"
  ok "Connecté à GitHub${login:+ en tant que $login}"
else
  meh "Tu n'es pas connecté à GitHub dans cet environnement"
  hint "Lance « gh auth login » : GitHub.com, HTTPS, « Login with a web browser »"
fi
if [[ -n "$(git config user.name || true)" && -n "$(git config user.email || true)" ]]; then
  ok "Identité Git : $(git config user.name) <$(git config user.email)>"
else
  meh "Ton identité Git n'est pas réglée : tes commits seront refusés"
  hint "git config --global user.name \"Prénom Nom\" && git config --global user.email \"toi@exemple.fr\""
fi
# La clé GPG du poste n'existe pas dans le devcontainer : une signature exigée fait échouer chaque commit.
# On le prouve en signant un commit d'essai, qui n'est rattaché à aucune branche.
if [[ "$(git -C "$USINE_ROOT" config --get commit.gpgsign || true)" == true ]] \
  && ! git -C "$USINE_ROOT" commit-tree -S -m "essai de signature" 'HEAD^{tree}' </dev/null >/dev/null 2>&1; then
  meh "Git exige de signer les commits, mais la signature échoue dans cet environnement"
  hint "Dans ce dépôt seulement : git config --local commit.gpgsign false"
fi

title "Réseau"
net_ko=()
for url in https://github.com https://ghcr.io/v2/ https://registry-1.docker.io/v2/; do
  # Un registre répond 401 sans jeton : toute réponse HTTP prouve qu'il est joignable.
  code="$(curl -s -o /dev/null -m 6 -w '%{http_code}' "$url" || true)"
  [[ "$code" =~ ^[1-5][0-9][0-9]$ ]] || net_ko+=("$url")
done
if [[ "${#net_ko[@]}" -eq 0 ]]; then
  ok "GitHub et les registres d'images sont joignables"
else
  meh "Injoignable : ${net_ko[*]}"
  hint "Sans réseau, les labs locaux fonctionnent si « usine pull » a déjà été fait ; les labs GitHub attendront"
fi

title "Images"
total=0
absent=0
while read -r image; do
  total=$((total + 1))
  image_present "$image" || absent=$((absent + 1))
done < <(list_images)
if [[ "$total" -eq 0 ]]; then
  info "Aucune image listée pour l'instant"
elif [[ "$absent" -eq 0 ]]; then
  ok "Les $total images du cours sont sur le poste"
else
  meh "$absent image(s) sur $total manquent"
  hint "Lance « usine pull » chez toi, avant le cours : le réseau de l'école ne suffira pas"
fi

echo
if [[ "$failures" -gt 0 ]]; then
  echo "${_c_fail}Résultat : poste non prêt${_c_off} — $failures problème(s) bloquant(s), $warnings avertissement(s)."
  echo "Corrige les lignes ✗, relance « usine doctor ». Si tu restes bloqué : docs/AVANT-LE-COURS.md, section « Si ça bloque »."
  exit 1
elif [[ "$warnings" -gt 0 ]]; then
  echo "${_c_warn}Résultat : poste utilisable${_c_off} — $warnings avertissement(s) à traiter avant le cours si possible."
else
  echo "${_c_ok}Résultat : poste prêt.${_c_off}"
fi
