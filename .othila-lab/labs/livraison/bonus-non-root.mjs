import { assert } from '@othila-academy/lab';
import { dockerExec } from '../../shared/docker.mjs';
import { requireServer } from '../../shared/serveurs.mjs';

export const title = "Bonus — une image qui ne tourne pas en root";
export const explain = "Qu'est-ce qu'un attaquant gagne de plus si l'application tourne en root dans son conteneur ?";
export const instructions = `Facultatif. Le Dockerfile fourni fonctionne, mais l'application y tourne en root, et l'image garde npm et le cache
de construction. Améliore-le (c'est la seule modification de app/ admise, sur ta branche) :
  - deux étapes (FROM … AS deps, puis une image finale qui ne copie que ce qui sert) ;
  - USER node : l'image officielle de Node.js fournit cet utilisateur.
Commit, push, pipeline vert, usine deploy test.

À expliquer (npx lab submit livraison bonus-non-root) : qu'est-ce qu'un attaquant gagne de plus si l'application tourne en root dans son conteneur ?`;

export const checks = [
  {
    id: 'app-test-non-root',
    label: "l'application de app-test ne tourne pas en root",
    run: async () => {
      await requireServer('app-test', 'usine deploy test');
      const { stdout } = await dockerExec('app-test', ['id', '-u']);
      assert(stdout.trim() && stdout.trim() !== '0', `Attendu : un utilisateur autre que root. Constaté : uid ${stdout.trim() || '?'}. Une ligne USER dans le Dockerfile.`);
    }
  }
];

export const hints = [
  'Sous quel utilisateur tourne app-test ? docker exec app-test id.',
  'L’image node fournit un utilisateur node ; une instruction USER change l’utilisateur des instructions suivantes et du conteneur.',
  'Étape 1 : FROM node… AS deps, npm ci --omit=dev ; étape 2 : FROM node…, COPY --from=deps /app/node_modules, COPY src, USER node.'
];

export const points = 50;
