import { assert } from '@othila-academy/lab';
import { localOuDistant } from '../../shared/distant.mjs';
import { artifacts, lastRunOnHead } from '../../shared/github.mjs';
import { actPush } from '../../shared/act.mjs';

export const title = 'Un pipeline au vert';
export const explain = 'Un pipeline vert prouve-t-il que le code marche ? Que prouve-t-il exactement ?';
export const instructions = `Pousse ton workflow, puis suis son exécution :
  git push
  gh run watch            (ou l'onglet Actions de ton fork)
Attendu : l'exécution du commit courant est un succès, et elle a laissé un artefact rapport-de-tests. Ouvre-le :
c'est le rapport JUnit, celui qu'un outil de suivi des tests lirait.
Si l'exécution échoue : gh run view --log-failed montre l'étape en cause.
Repère : le check interroge GitHub sur ton commit courant (git rev-parse HEAD) : pousse avant de vérifier.

À expliquer (npx lab submit pipeline-ci vert) : un pipeline vert prouve-t-il que le code marche ? Que prouve-t-il exactement ?`;

export const checks = [
  localOuDistant({
    id: 'execution-verte',
    label: 'la dernière exécution de ci.yml sur le commit courant est un succès (GitHub ; act au rejeu)',
    replay: async () => {
      const result = await actPush();
      assert(result.code === 0, `Attendu : le workflow réussit sous act. Constaté : ${result.summary}`);
    },
    session: async () => {
      const { run } = await lastRunOnHead();
      assert(run.conclusion === 'success', `Attendu : succès. Constaté : ${run.conclusion}. gh run view ${run.id} --log-failed montre l'étape en cause.`);
    }
  }),
  localOuDistant({
    id: 'rapport-artefact',
    label: 'cette exécution a publié un artefact de rapport de tests (GitHub ; act au rejeu)',
    replay: async () => {
      const result = await actPush();
      assert(result.artifacts.length > 0, `Attendu : un artefact publié. Constaté : aucun. ${result.summary}`);
    },
    session: async () => {
      const { repo, run } = await lastRunOnHead();
      const list = await artifacts(repo, run.id);
      assert(list.length > 0, "Attendu : au moins un artefact (le rapport JUnit). Constaté : aucun. L'étape actions/upload-artifact a-t-elle tourné ? Son path désigne-t-il app/reports/junit.xml ?");
    }
  })
];

export const hints = [
  'Que montre gh run list ? Ton dernier commit y figure-t-il, et dans quel état ?',
  'gh run view --log-failed donne l’étape en échec. Un artefact vide vient souvent d’un path faux : le rapport est écrit dans app/reports/junit.xml.',
  'git push, puis gh run watch. Rapport : uses: actions/upload-artifact@v6 avec if: always(), name: rapport-de-tests, path: app/reports/junit.xml.'
];

export const points = 150;
