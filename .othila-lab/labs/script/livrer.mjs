import { assert } from '@othila-academy/lab';
import { health, requireDeployScript, requireServer, servesHead } from '../../shared/serveurs.mjs';

export const title = 'Livrer une référence sur srv-test';
export const explain = 'Pourquoi le script livre-t-il un SHA plutôt que « la dernière version » ?';
export const instructions = `srv-test est vide (lab demarrage). Écris project/deploy/deploy.sh <ref>, qui fait dans l'ordre :
  1. récupérer le code à la référence demandée : git rev-parse --verify "<ref>^{commit}" donne le SHA complet,
     git archive <sha> app | tar -x -C <dossier temporaire> en extrait le code ;
  2. installer les dépendances : npm ci, dans ce dossier ;
  3. lancer le lint et les tests : npm run lint, npm test ;
  4. livrer sur srv-test : le code dans /opt/reservations (dépendances d'exécution comprises, npm prune --omit=dev),
     par SSH seulement (tar … | ssh deploy@srv-test 'tar -x -C /opt/reservations') ;
  5. écrire le fichier d'environnement /etc/reservations/reservations.env (format CLE=valeur) : APP_VERSION et
     APP_COMMIT, ce que renverra /version ;
  6. redémarrer le service : sudo service reservations restart ;
  7. vérifier que http://srv-test:8080/health répond (curl --retry).
Chaque commande est commentée. En tête : #!/usr/bin/env bash et set -euo pipefail. chmod +x, puis :
  git add project/deploy && git commit -m "Ajoute le script de déploiement"
  project/deploy/deploy.sh HEAD
  curl http://srv-test:8080/version
Repères : la clé SSH est ~/.ssh/usine_lab ; l'utilisateur deploy a sudo sans mot de passe ; le service lit
/etc/reservations/reservations.env à chaque démarrage. Rien n'est à installer sur le serveur : Node.js y est.

À expliquer (npx lab submit script livrer) : pourquoi le script livre-t-il un SHA plutôt que « la dernière version » ?`;

export const prediction = {
  promptId: 'script-srv-test-vide',
  question: 'srv-test tourne, mais rien n’y a été déployé. Que répond http://srv-test:8080/health ?',
  choices: ['200', '503', 'rien : connexion refusée'],
  expected: 'rien : connexion refusée'
};

export const checks = [
  {
    id: 'script-present',
    label: 'project/deploy/deploy.sh existe et est exécutable',
    run: async () => requireDeployScript()
  },
  {
    id: 'health-srv-test',
    label: 'srv-test répond sur /health',
    run: async () => {
      await requireServer('srv-test');
      await health('srv-test');
    }
  },
  {
    id: 'version-sha',
    label: '/version de srv-test renvoie le SHA du commit courant',
    run: async () => {
      await requireServer('srv-test');
      await servesHead('srv-test');
    }
  }
];

export const hints = [
  'Quelles commandes as-tu tapées à la main en SSH au lab demarrage ? Le script les enchaîne, dans le même ordre, depuis le devcontainer.',
  'Une variable sha=$(git rev-parse --verify "$1^{commit}") ; git archive "$sha" app | tar -x -C "$work" ; npm ci, lint, tests dans "$work/app" ; puis tar -cz … | ssh deploy@srv-test "tar -xz -C /opt/reservations".',
  'Après la livraison : printf "APP_VERSION=1.0.0\\nAPP_COMMIT=%s\\n" "$sha" | ssh … "cat > /etc/reservations/reservations.env" ; ssh … "sudo service reservations restart" ; curl -fsS --retry 10 --retry-connrefused http://srv-test:8080/health.'
];

export const points = 150;
