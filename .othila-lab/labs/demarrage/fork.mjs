import { assert } from '@othila-academy/lab';
import { run } from '../../shared/run.mjs';
import { distant, ghApi, poste } from '../../shared/distant.mjs';

const COURSE = 'othila-academy/automation-labs';
const repoOf = (url) => /github\.com[:/]+([^/]+\/[^/]+?)(\.git)?\/?$/.exec(url)?.[1]?.toLowerCase() ?? null;
async function remote(name) {
  const { code, stdout } = await run('git', ['remote', 'get-url', name]);
  return code === 0 ? stdout.trim() : null;
}
async function fork() {
  const url = await remote('origin');
  const repo = url && repoOf(url);
  assert(repo && repo !== COURSE, `Attendu : origin pointe vers ton fork. Constaté : ${url ?? 'aucun origin'}. Lance gh repo fork --remote.`);
  return repo;
}

export const title = 'Forker le dépôt du cours';
export const explain = "Pourquoi le dépôt du cours devient-il « upstream », et à quoi servira-t-il pendant la semaine ?";
export const instructions = `Ton pipeline (lab pipeline-ci) et ton registre d'images (lab livraison) vivent sur GitHub : il te faut ton propre
dépôt. Le tien est un fork du cours : il garde son historique et ses étiquettes (base, solution/…).
  gh repo fork --remote
gh renomme le dépôt du cours en upstream et ajoute ton fork comme origin. Vérifie : git remote -v.
Sur GitHub, un fork naît avec Actions désactivé : onglet Actions de ton fork, « I understand my workflows, go ahead
and enable them » (ou gh api -X PUT repos/<toi>/automation-labs/actions/permissions -F enabled=true).
Puis, dans cet ordre :
  npx lab join            (--terminal si le navigateur ne s'ouvre pas)
  npx lab init            crée ta branche my-project depuis le tag base
  usine rebuild           à relancer après lab init et après chaque lab catchup
  git push -u origin my-project
Si lab init dit « tag base introuvable » : git fetch upstream --tags, puis recommence.

À expliquer (npx lab submit demarrage fork) : pourquoi le dépôt du cours devient-il upstream, et à quoi servira-t-il pendant la semaine ?`;

export const prediction = {
  promptId: 'demarrage-fork-origin',
  question: 'Après gh repo fork --remote, vers quel dépôt pointe origin ?',
  choices: ['le dépôt du cours', 'ton fork'],
  expected: 'ton fork'
};

export const checks = [
  poste({
    id: 'remotes',
    label: 'origin est ton fork, upstream est le dépôt du cours',
    run: async () => {
      await fork();
      const up = await remote('upstream');
      assert(repoOf(up ?? '') === COURSE, `Attendu : upstream = ${COURSE}. Constaté : ${up ?? 'aucun upstream'}. git remote -v pour voir.`);
    }
  }),
  distant({
    id: 'actions-actif',
    label: 'Actions est activé sur ton fork',
    run: async () => {
      const repo = await fork();
      const permissions = await ghApi(`/repos/${repo}/actions/permissions`);
      assert(permissions?.enabled === true, `Attendu : Actions activé sur ${repo}. Constaté : désactivé. Onglet Actions de ton fork, bouton vert.`);
    }
  }),
  distant({
    id: 'my-project-pousse',
    label: 'ta branche my-project est poussée sur ton fork',
    run: async () => {
      const repo = await fork();
      try {
        await ghApi(`/repos/${repo}/branches/my-project`);
      } catch (error) {
        if (error.status === 404) throw new Error(`Attendu : my-project sur ${repo}. Constaté : absente. git push -u origin my-project.`);
        throw error;
      }
    }
  })
];

export const hints = [
  'git remote -v : combien de dépôts distants vois-tu, et lequel t’appartient ?',
  'gh repo fork --remote fait tout : le fork sur GitHub, et les deux dépôts distants en local. Actions s’active dans l’onglet Actions du fork.',
  'gh repo fork --remote ; onglet Actions du fork, bouton d’activation ; npx lab join ; npx lab init ; usine rebuild ; git push -u origin my-project.'
];

export const points = 25;
