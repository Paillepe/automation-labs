
#!/usr/bin/env bash

# Arrête le script à la première erreur, en cas de variable manquante ou d'erreur dans un pipeline.
set -euo pipefail

# Vérifie que les commandes nécessaires au déploiement sont disponibles.
for cmd in git npm ssh tar curl node; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "[erreur] Commande manquante : $cmd" >&2
    exit 1
  }
done

# Vérifie que la clé SSH nécessaire à la connexion existe.
if [[ ! -f "$HOME/.ssh/usine_lab" ]]; then
  echo "[erreur] Clé SSH introuvable : $HOME/.ssh/usine_lab" >&2
  exit 1
fi

# Récupère la référence Git fournie et refuse de continuer si elle est absente.
REF="${1:?usage: deploy.sh <ref>}"

# Affiche le nom de chaque étape pour faciliter la lecture du déploiement.
step() {
  echo "[deploy] $*"
}

step "Vérification de la référence"

# Vérifie que la référence existe et récupère le SHA complet du commit.
COMMIT="$(git rev-parse --verify "${REF}^{commit}")"

# Crée un dossier temporaire pour préparer la livraison.
TMP_DIR="$(mktemp -d)"

# Supprime le dossier temporaire à la fin du script, même en cas d'erreur.
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

step "Transfert vers srv-test"

# Prépare le dossier de destination et supprime l'ancien contenu sur le serveur.
ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'mkdir -p /opt/reservations && find /opt/reservations -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'

# Transfère l'application et ses dépendances vers le serveur par SSH.
tar -cf - -C "$APP_DIR" . | ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'tar -x -C /opt/reservations'

step "Configuration de la version livrée"

# Crée le dossier de configuration sur le serveur s'il n'existe pas.
ssh -i "$HOME/.ssh/usine_lab" deploy@srv-test \
  'sudo install -d -m 0755 /etc/reservations'

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
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 2 \
  http://srv-test:8080/health

step "Déploiement terminé"
