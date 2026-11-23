import { assert } from '@othila-academy/lab';
import { distant } from '../../shared/distant.mjs';
import { runs } from '../../shared/github.mjs';

export const title = 'Le faire échouer exprès';
export const explain = 'Pourquoi casser volontairement un test ? Que saurait-on de moins sans cette étape ?';
export const instructions = `Un pipeline qui ne peut pas échouer ne prouve rien. Sur une branche à part, casse un test :
  git switch -c test-casse
  (modifie une valeur attendue dans app/test/app.test.js, par exemple le code HTTP attendu de /health)
  git commit -am "Casse un test, exprès" && git push -u origin test-casse
Constate l'échec dans l'onglet Actions (le rapport de tests est quand même publié), puis reviens et supprime la branche :
  git switch my-project && git push origin --delete test-casse && git branch -D test-casse
C'est la seule fois de la semaine où l'on touche à app/ : jamais sur my-project.

À expliquer (npx lab submit pipeline-ci rouge) : pourquoi casser volontairement un test ? Que saurait-on de moins sans cette étape ?`;

export const checks = [
  distant({
    id: 'execution-rouge',
    label: 'une exécution de ci.yml a échoué sur ton fork (un test cassé exprès)',
    run: async () => {
      const { repo, runs: list } = await runs({ status: 'failure' });
      assert(list.length > 0, `Attendu : au moins une exécution en échec sur ${repo}. Constaté : aucune. Pousse une branche avec un test cassé.`);
    }
  })
];

export const hints = [
  'Quel test de app/test/ pourrais-tu fausser en changeant une seule valeur attendue ?',
  'Une branche à part (git switch -c test-casse), une valeur attendue modifiée dans app/test/app.test.js, un commit, git push -u origin test-casse.',
  'Dans app/test/app.test.js, remplace un assert.equal(res.status, 200) par 201 ; commit et push sur test-casse ; constate l’échec ; git switch my-project.'
];

export const points = 75;
