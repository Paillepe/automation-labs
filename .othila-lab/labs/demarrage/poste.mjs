import { assert } from '@othila-academy/lab';
import { DOCKER_DOWN, dockerOk } from '../../shared/docker.mjs';
import { distant, ghApi } from '../../shared/distant.mjs';

export const title = 'Vérifier le poste';
export const explain = "usine doctor affiche des lignes ✓, ⚠ et ✗. Qu'est-ce qui distingue un avertissement d'une erreur ?";
export const instructions = `Dans le terminal du devcontainer (VS Code, « Terminal > New Terminal ») :
  usine doctor
Chaque ligne ✗ est suivie d'un geste (→). Corrige jusqu'à lire « poste utilisable ». Les lignes ⚠ sur GitHub
disparaissent à l'étape suivante.
Connecte ensuite l'outil gh à ton compte GitHub :
  gh auth login        (GitHub.com, HTTPS, « Login with a web browser » ; accepte la portée workflow)
  gh auth status
Si un poste reste rouge plus de 10 minutes : GitHub Codespaces (docs/AVANT-LE-COURS.md, section 7), ou en binôme.

À expliquer (npx lab submit demarrage poste) : qu'est-ce qui distingue un avertissement d'une erreur dans usine doctor ?`;

export const checks = [
  {
    id: 'docker-repond',
    label: 'Docker répond depuis le devcontainer',
    passesOnStart: true,
    run: async () => assert(await dockerOk(), DOCKER_DOWN)
  },
  distant({
    id: 'gh-connecte',
    label: 'gh est connecté à ton compte GitHub',
    run: async () => {
      const user = await ghApi('/user');
      assert(user?.login, 'Attendu : gh connecté à un compte. Constaté : aucun compte. Lance gh auth login.');
    }
  })
];

export const hints = [
  'Que dit la dernière ligne de usine doctor ? Chaque ✗ est suivie de son remède (→).',
  'Docker Desktop doit être lancé sur ton poste, réglé à 4 Go de mémoire au moins ; gh auth login se fait dans le devcontainer.',
  'Docker Desktop lancé, usine doctor, puis gh auth login (GitHub.com, HTTPS, navigateur) et gh auth status qui affiche ton compte.'
];

export const points = 25;
