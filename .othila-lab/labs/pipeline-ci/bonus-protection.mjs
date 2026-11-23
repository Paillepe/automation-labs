import { assert } from '@othila-academy/lab';
import { distant, ghApi, requireOrigin } from '../../shared/distant.mjs';

export const title = 'Bonus — protéger my-project';
export const explain = 'Que gagne-t-on à exiger un pipeline vert avant toute fusion ? Qu’y perd-on ?';
export const instructions = `Facultatif. Protège ta branche my-project : plus aucune fusion sans pipeline vert.
Sur GitHub : Settings > Branches > Add branch ruleset (ou « Add rule »), branche my-project, « Require status checks
to pass », et choisis le job de ton workflow. Essaie ensuite d'ouvrir une pull request depuis une branche au test
cassé : le bouton de fusion reste bloqué.
Autres pistes, sans check : le cache des dépendances (setup-node, cache: npm), une matrice de versions de Node.js.

À expliquer (npx lab submit pipeline-ci bonus-protection) : que gagne-t-on à exiger un pipeline vert avant toute fusion ? Qu'y perd-on ?`;

export const checks = [
  distant({
    id: 'my-project-protegee',
    label: 'my-project exige un statut de pipeline vert avant fusion',
    run: async () => {
      const repo = await requireOrigin();
      const rules = await ghApi(`/repos/${repo}/rules/branches/my-project`).catch(() => []);
      const viaRules = (rules ?? []).some((r) => r.type === 'required_status_checks');
      let viaProtection = false;
      if (!viaRules) {
        const protection = await ghApi(`/repos/${repo}/branches/my-project/protection`).catch(() => null);
        viaProtection = Boolean(protection?.required_status_checks);
      }
      assert(viaRules || viaProtection, `Attendu : une règle « Require status checks » sur my-project. Constaté : aucune sur ${repo}.`);
    }
  })
];

export const hints = [
  'Dans les réglages de ton fork, quelle section protège une branche ?',
  'Settings > Branches (ou Rules > Rulesets) : une règle sur my-project avec « Require status checks to pass ».',
  'Settings > Rules > Rulesets > New branch ruleset ; cible : my-project ; cocher « Require status checks to pass » et ajouter le job de ci.yml ; Enforcement : Active.'
];

export const points = 50;
