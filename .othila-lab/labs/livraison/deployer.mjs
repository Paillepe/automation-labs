import { assert } from '@othila-academy/lab';
import { distant } from '../../shared/distant.mjs';
import { inspect } from '../../shared/docker.mjs';
import { get, seen } from '../../shared/http.mjs';
import { imageName, registryDigest } from '../../shared/registre.mjs';
import { headSha } from '../../shared/run.mjs';
import { requireServer, servesHead } from '../../shared/serveurs.mjs';

export const title = "Déployer en test l'image publiée";
export const explain = "Pourquoi lancer l'image par son condensat (sha256:…) plutôt que par son étiquette ?";
export const instructions = `Déploie en test l'image que ton pipeline a publiée, et non celle de ton poste :
  usine deploy test
Sans argument, la commande tire ghcr.io/<toi>/<dépôt>:<SHA du commit courant> et lance app-test par son condensat :
ce qui tourne est exactement ce qui est dans le registre. Vérifie :
  docker inspect app-test --format '{{.Config.Image}}'
  curl http://app-test:8080/version ; curl http://app-test:8080/ready
Un nouveau commit ? Push, pipeline vert, usine deploy test. C'est tout ce qui reste de ton deploy.sh.

À expliquer (npx lab submit livraison deployer) : pourquoi lancer l'image par son condensat plutôt que par son étiquette ?`;

export const checks = [
  distant({
    id: 'app-test-condensat',
    label: "app-test exécute exactement l'image publiée pour le SHA courant (même condensat)",
    run: async () => {
      await requireServer('app-test', 'usine deploy test');
      const sha = await headSha();
      const digest = await registryDigest(sha);
      assert(digest, `Attendu : ${await imageName()}:${sha.slice(0, 12)}… dans le registre. Constaté : absente. Étape publier d'abord.`);
      const running = (await inspect('app-test'))?.Config?.Image ?? '';
      assert(running.endsWith(digest), `Attendu : app-test lancé depuis ${digest.slice(0, 19)}…. Constaté : ${running}. Lance usine deploy test, sans argument.`);
    }
  }),
  {
    id: 'app-test-sert-head',
    label: 'app-test sert le commit courant, et /ready est vert',
    run: async () => {
      await requireServer('app-test', 'usine deploy test');
      await servesHead('app-test');
      const r = await get('http://app-test:8080/ready');
      assert(r.status === 200, `Attendu : /ready en HTTP 200. Constaté : ${seen(r)}. docker logs app-test.`);
    }
  }
];

export const hints = [
  'Que lance usine deploy test quand on ne lui donne aucun argument ? usine deploy test --help.',
  'Le commit courant doit être poussé, et son pipeline vert : c’est son SHA que la commande cherche dans le registre.',
  'git push ; gh run watch ; usine deploy test ; docker inspect app-test --format "{{.Config.Image}}" se termine par le condensat publié.'
];

export const points = 100;
