import { assert } from '@othila-academy/lab';
import { get, seen } from '../../shared/http.mjs';
import { requireServer, servesHead } from '../../shared/serveurs.mjs';

export const title = "Construire l'image du commit";
export const explain = "Pourquoi le SHA du commit entre-t-il dans l'image au moment de la construire, plutôt qu'au déploiement ?";
export const instructions = `Relis ton deploy.sh : que fait déjà ton pipeline à sa place, et que reste-t-il ?
L'image remplace le dossier livré par SSH : le code, ses dépendances et Node.js, figés ensemble. Le Dockerfile est
fourni (app/Dockerfile) ; la version et le commit entrent par des arguments de construction.
  docker build --build-arg APP_VERSION=1.0.0 --build-arg APP_COMMIT="$(git rev-parse HEAD)" \\
    -t "reservations:$(git rev-parse HEAD)" app
  usine deploy test "reservations:$(git rev-parse HEAD)"
  curl http://app-test:8080/version
  curl http://app-test:8080/ready
usine deploy test lance l'image dans app-test, branchée sur db-test : /ready est vert, pour la première fois.
Depuis le navigateur du poste : http://127.0.0.1:18080/version.

À expliquer (npx lab submit livraison image-locale) : pourquoi le SHA du commit entre-t-il dans l'image au moment de la construire, plutôt qu'au déploiement ?`;

export const prediction = {
  promptId: 'livraison-reste-du-script',
  question: 'Ton pipeline installe, analyse et teste déjà. Parmi les étapes de deploy.sh, lesquelles restent faites à la main ?',
  choices: ['aucune', 'livrer, redémarrer, vérifier', 'toutes'],
  expected: 'livrer, redémarrer, vérifier'
};

export const checks = [
  {
    id: 'app-test-commit',
    label: 'app-test tourne et /version renvoie le SHA du commit courant',
    run: async () => {
      await requireServer('app-test', 'usine deploy test');
      await servesHead('app-test');
    }
  },
  {
    id: 'app-test-ready',
    label: 'app-test est prête : /ready est vert (la base de test répond)',
    run: async () => {
      await requireServer('app-test', 'usine deploy test');
      const r = await get('http://app-test:8080/ready');
      assert(r.status === 200, `Attendu : /ready en HTTP 200. Constaté : ${seen(r)}${r.json?.reason ? ` (${r.json.reason})` : ''}. docker logs app-test.`);
    }
  }
];

export const hints = [
  'Quelles valeurs renvoie /version, et d’où l’application les tient-elle ? Le Dockerfile de app/ le dit.',
  'docker build --build-arg … -t <nom>:<étiquette> app construit ; usine deploy test <nom>:<étiquette> prend une image locale telle quelle.',
  'docker build --build-arg APP_VERSION=1.0.0 --build-arg APP_COMMIT="$(git rev-parse HEAD)" -t "reservations:$(git rev-parse HEAD)" app, puis usine deploy test "reservations:$(git rev-parse HEAD)".'
];

export const points = 75;
