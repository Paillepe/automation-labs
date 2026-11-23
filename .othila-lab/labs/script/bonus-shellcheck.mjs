import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { DEPLOY, requireDeployScript } from '../../shared/serveurs.mjs';
import { ROOT, run, tail } from '../../shared/run.mjs';

export const title = 'Bonus — un script sans avertissement';
export const explain = 'Choisis un avertissement que shellcheck t’a signalé : quel bug aurait-il pu provoquer ?';
export const instructions = `Facultatif. shellcheck repère les pièges de Bash : variables non protégées par des guillemets, cd qui échoue en
silence, retours de commande ignorés.
  shellcheck project/deploy/deploy.sh
Corrige jusqu'à ce qu'il ne dise plus rien. Défi sans check, pour aller plus loin : un retour arrière automatique,
qui relivre la version précédente si /health ne répond pas après le redémarrage.

À expliquer (npx lab submit script bonus-shellcheck) : choisis un avertissement que shellcheck t'a signalé : quel bug aurait-il pu provoquer ?`;

export const checks = [
  {
    id: 'shellcheck-propre',
    label: 'shellcheck ne signale rien dans project/deploy/deploy.sh',
    run: async () => {
      requireDeployScript();
      const { code, stdout } = await run('shellcheck', ['-f', 'gcc', path.join(ROOT, DEPLOY)], { timeout: 20000 });
      const count = stdout.trim() ? stdout.trim().split('\n').length : 0;
      assert(code === 0, `Attendu : aucun avertissement. Constaté : ${count} — ${tail(stdout, 2)}`);
    }
  }
];

export const hints = [
  'Que dit shellcheck project/deploy/deploy.sh, et quel code SC accompagne chaque ligne ?',
  'Chaque code SC a sa page : https://www.shellcheck.net/wiki/SC2086 par exemple. Le plus fréquent : des guillemets autour des variables.',
  '"$var" plutôt que $var, cd … || exit, et une directive # shellcheck disable=SCxxxx commentée là où l’avertissement est voulu.'
];

export const points = 50;
