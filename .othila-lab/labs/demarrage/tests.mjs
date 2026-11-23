import { existsSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { ROOT, run, tail } from '../../shared/run.mjs';

export const title = "Lancer les tests de l'application";
export const explain = "Le rapport app/reports/junit.xml n'est lu par personne en local. À qui servira-t-il ?";
export const instructions = `L'application arrive avec ses tests unitaires et son analyse statique. Lance-les comme le fera ton pipeline :
  cd app
  npm ci            installe exactement les versions de package-lock.json
  npm run lint
  npm test          rapport JUnit dans app/reports/junit.xml
  cd ..
Ce sont ces commandes que ton script (lab script) puis ton pipeline (lab pipeline-ci) reprendront.
Ne modifie rien dans app/ : c'est le code de l'équipe de développement.

À expliquer (npx lab submit demarrage tests) : le rapport app/reports/junit.xml n'est lu par personne en local. À qui servira-t-il ?`;

export const checks = [
  {
    id: 'tests-app',
    label: "les tests de l'application passent en local (npm test dans app/, 60 s au plus)",
    run: async () => {
      assert(existsSync(path.join(ROOT, 'app/node_modules')), 'Attendu : les dépendances installées dans app/. Constaté : app/node_modules absent. Lance cd app && npm ci.');
      const { code, stdout, stderr, timedOut } = await run('npm', ['test', '--silent'], { cwd: path.join(ROOT, 'app'), timeout: 60000 });
      assert(!timedOut, 'Attendu : les tests en moins de 60 s. Constaté : toujours en cours. Relance npm test dans app/ pour voir où ils bloquent.');
      assert(code === 0, `Attendu : npm test réussit. Constaté : code ${code} — ${tail(stderr || stdout)}. As-tu modifié app/ ? git status le dit.`);
    }
  }
];

export const hints = [
  'Dans quel dossier se trouve le package.json de l’application ? C’est là que se lancent les commandes npm.',
  'npm ci installe les dépendances, npm test lance les tests ; les deux dans app/.',
  'cd app && npm ci && npm run lint && npm test, puis cd .. ; le rapport est dans app/reports/junit.xml.'
];

export const points = 25;
