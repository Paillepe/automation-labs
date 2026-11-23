import { existsSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { ROOT, run, tail } from '../../shared/run.mjs';
import { WORKFLOW } from '../../shared/github.mjs';

export const title = 'Écrire le workflow';
export const explain = 'Pourquoi déclencher le pipeline sur toutes les branches, et pas seulement sur my-project ?';
export const instructions = `Crée .github/workflows/ci.yml : un workflow « ci », déclenché à chaque push sur toutes les branches
(branches: ['**'] : my-project, et les branches catchup-… de lab catchup) et à chaque pull request. Un job, sur
ubuntu-24.04, qui :
  1. récupère le code : actions/checkout@v7 ;
  2. installe Node.js 24 : actions/setup-node@v7, node-version 24.22.3 (celle du devcontainer) ;
  3. dans app/ : npm ci, npm run lint, npm test (le rapport JUnit s'écrit dans app/reports/junit.xml) ;
  4. construit l'image : docker build app (elle sera publiée au lab livraison) ;
  5. publie le rapport : actions/upload-artifact@v6, nommé rapport-de-tests, même quand les tests échouent
     (if: always()).
Repère : defaults.run.working-directory: app évite de répéter cd app. Donne au jeton du workflow le moins de droits
possible : permissions: contents: read.
Vérifie la syntaxe en local, avant de pousser :
  actionlint
Puis git add, git commit, git push.

À expliquer (npx lab submit pipeline-ci workflow) : pourquoi déclencher le pipeline sur toutes les branches, et pas seulement sur my-project ?`;

export const prediction = {
  promptId: 'pipeline-ci-test-casse',
  question: 'Un collègue pousse un commit qui casse un test, sans lancer deploy.sh. Qui s’en aperçoit avant la mise en production ?',
  choices: ['personne', 'deploy.sh', 'GitHub'],
  expected: 'personne'
};

export const checks = [
  {
    id: 'workflow-present',
    label: '.github/workflows/ci.yml existe',
    run: async () => assert(existsSync(path.join(ROOT, WORKFLOW)), `Attendu : ${WORKFLOW}. Constaté : absent. Le nom du fichier compte : les checks suivent ci.yml.`)
  },
  {
    id: 'actionlint',
    label: 'actionlint valide le workflow, sans aucun avertissement',
    run: async () => {
      assert(existsSync(path.join(ROOT, WORKFLOW)), `Attendu : ${WORKFLOW}. Constaté : absent.`);
      const { code, stdout, stderr } = await run('actionlint', ['-no-color', '-oneline', WORKFLOW], { timeout: 20000 });
      assert(code === 0, `Attendu : actionlint sans erreur. Constaté : ${tail(stdout || stderr, 3)}`);
    }
  }
];

export const hints = [
  'Un workflow tient en trois clés de premier niveau : name, on, jobs. Que met-on sous on: pour réagir à un push et à une pull request ?',
  'on: { push: { branches: [\'**\'] }, pull_request: {} } ; un job avec runs-on: ubuntu-24.04 et des steps : uses: pour une action, run: pour une commande.',
  'steps : uses: actions/checkout@v7 ; uses: actions/setup-node@v7 avec node-version: 24.22.3 ; run: npm ci ; run: npm run lint ; run: npm test ; run: docker build app (working-directory: .) ; uses: actions/upload-artifact@v6 avec if: always(), name: rapport-de-tests, path: app/reports/junit.xml.'
];

export const points = 100;
