#!/usr/bin/env bash

# Arrête le script à la première erreur, en cas de variable manquante ou d'erreur dans un pipeline.
set -euo pipefail

# Vérifie que les commandes nécessaires au déploiement sont disponibles.
for cmd in git npm ssh tar curl node; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "[ERREUR] Commande manquante : $cmd" >&2
    exit 1
  }
done

# Vérifie que la clé SSH nécessaire à la connexion existe.
if [[ ! -f "$HOME/.ssh/usine_lab" ]]; then
  echo "[ERREUR]"
  echo "##########"
  echo "Clé SSH introuvable : $HOME/.ssh/usine_lab" >&2
  echo "##########"
  exit 1
fi

# Vérifie qu'une référence Git a été fournie.
if [[ $# -eq 0 || -z "$1" ]]; then
echo "[ERREUR]"
  echo "########## Il faut fournir la branche ou le commit à déployer." >&2
  echo "   Usage : deploy.sh <ref>" >&2
  echo "##########"
  exit 1
fi

# Récupère la référence Git fournie.
REF="$1"

# Affiche le nom de chaque étape pour faciliter la lecture du déploiement.
step() {
  echo ""
  echo "========================================"
  echo "[DEPLOY] $*"
  echo "========================================"
}

step "Vérification de la référence"

# Vérifie que la référence existe et récupère le SHA complet du commit.
if ! COMMIT="$(git rev-parse --verify "${REF}^{commit}" 2>/dev/null)"; then
  echo "[ERREUR] La référence Git '$REF' n'existe pas ou ne désigne pas un commit."
  echo "###### Références disponibles :"
  git branch --list
  echo "######"
  exit 1
fi

# Vérifie si le commit demandé est déjà déployé sur le serveur.
DEPLOYED_COMMIT="$(
  ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
    "grep '^APP_COMMIT=' /etc/reservations/reservations.env 2>/dev/null | cut -d= -f2- || true"
)"

if [[ "$DEPLOYED_COMMIT" == "$COMMIT" ]]; then
  echo "########"
     step "Cette version ($COMMIT) est déjà déployée. Aucun déploiement nécessaire."
  echo "########"
  exit 0
fi

# Crée un dossier temporaire local pour préparer la livraison.
TMP_DIR="$(mktemp -d)"

# Supprime le dossier temporaire local à la fin du script, même en cas d'erreur.
trap 'rm -rf "$TMP_DIR"' EXIT

step "Extraction du code"

# Extrait le dossier app correspondant exactement au commit demandé.
git archive "$COMMIT" app | tar -x -C "$TMP_DIR"

# Définit le dossier de l'application extraite.
APP_DIR="$TMP_DIR/app"

# Se place dans le dossier de l'application.
cd "$APP_DIR"

step "Installation des dépendances"

# Installe les dépendances à partir du fichier package-lock.json.
npm ci

step "Vérification du code"

# Exécute le lint et arrête le déploiement si une erreur est détectée.
npm run lint

step "Tests"

# Exécute les tests et arrête le déploiement si un test échoue.
npm test

step "Préparation de la livraison"

# Récupère la version de l'application définie dans package.json.
APP_VERSION="$(node -p "require('./package.json').version")"

# Supprime les dépendances de développement pour ne garder que celles nécessaires à l'exécution.
npm prune --omit=dev

#step "Préparation du dossier temporaire sur srv-test"

# Crée le dossier temporaire distant et nettoie une éventuelle ancienne tentative.
#ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
#  'mkdir -p /opt/reservations-staging && find /opt/reservations-staging -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'

#step "Transfert vers srv-test"

# Transfère l'application et ses dépendances dans le dossier temporaire distant.
#tar -cf - -C "$APP_DIR" . | ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
#  'tar -x -C /opt/reservations-staging'

#step "Installation de la nouvelle application"

# Prépare le dossier définitif sur le serveur et supprime son ancien contenu uniquement après le transfert réussi.
#ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
#  'mkdir -p /opt/reservations && find /opt/reservations -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && cp -a /opt/reservations-staging/. /opt/reservations/ && rm -rf /opt/reservations-staging'

# Crée le répertoire de destination sur le serveur s'il n'existe pas.
ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'mkdir -p /opt/reservations'

# Copie directement le contenu de l'application dans /opt/reservations.
tar -cf - -C "$APP_DIR" . | ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'tar -x -C /opt/reservations'

step "Configuration de la version livrée"

# Crée le dossier de configuration sur le serveur s'il n'existe pas.
ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'sudo mkdir -p /etc/reservations && sudo chmod 0755 /etc/reservations'

# Écrit la version et le SHA du commit dans le fichier d'environnement.
printf 'APP_VERSION=%s\nAPP_COMMIT=%s\n' "$APP_VERSION" "$COMMIT" | \
  ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'sudo tee /etc/reservations/reservations.env > /dev/null'

step "Redémarrage du service"

# Redémarre le service de réservation sur le serveur.
ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'sudo service reservations restart'

step "Vérification de la santé du serveur"

# Vérifie que le serveur répond sur /health, avec plusieurs tentatives si nécessaire.
echo "#########"
echo "10 tentatives avant échec"
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 \
  http://srv-test:8080/health
echo "#########"

step "Déploiement terminé"
