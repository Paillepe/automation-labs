import { randomBytes } from 'node:crypto';
import { assert } from '@othila-academy/lab';
import { deploy, health, requireServer, version } from '../../shared/serveurs.mjs';

export const title = 'Échouer sans casser';
export const explain = "Pourquoi le script doit-il échouer avant de toucher au serveur, plutôt qu'après ?";
export const instructions = `Un script de déploiement qui échoue ne doit rien laisser à moitié fait. Essaie :
  project/deploy/deploy.sh n-existe-pas ; echo "code : $?"
  curl http://srv-test:8080/version
Attendu : un message clair, un code de sortie non nul, et le service précédent qui répond toujours, avec le même
commit. Tout ce qui peut échouer (référence, dépendances, tests) passe avant la livraison.
Repère : set -e arrête le script à la première commande en échec ; git rev-parse --verify échoue sur une référence
inconnue. Le check lance ton script sur une référence inventée.

À expliquer (npx lab submit script refuser) : pourquoi le script doit-il échouer avant de toucher au serveur, plutôt qu'après ?`;

export const checks = [
  {
    id: 'reference-inconnue',
    label: 'lancé sur une référence inexistante, le script sort en erreur (code non nul)',
    run: async (ctx) => {
      await requireServer('srv-test');
      ctx.state.before = await version('srv-test');
      const result = await deploy(`ref-inexistante-${randomBytes(4).toString('hex')}`);
      ctx.state.after = true;
      assert(!result.timedOut, `Attendu : un échec rapide. Constaté : ${result.summary}`);
      assert(result.code !== 0, 'Attendu : un code de sortie non nul sur une référence inexistante. Constaté : code 0. Que fait ton script quand git rev-parse échoue ?');
    }
  },
  {
    id: 'service-precedent',
    label: 'après cet échec, le service précédent répond toujours, avec le même commit',
    run: async (ctx) => {
      await requireServer('srv-test');
      await health('srv-test');
      const now = await version('srv-test');
      const before = ctx.state.before?.commit;
      assert(!before || now.commit === before, `Attendu : srv-test sert toujours ${String(before).slice(0, 12)}. Constaté : ${String(now.commit).slice(0, 12)}. Ton script a touché au serveur avant d'échouer.`);
    }
  }
];

export const hints = [
  'Lance ton script sur une référence inventée : jusqu’où va-t-il avant de s’arrêter ? Regarde aussi echo $?.',
  'La première étape résout la référence (git rev-parse --verify) ; avec set -euo pipefail, son échec arrête le script avant toute commande ssh.',
  'sha="$(git rev-parse --verify --quiet "$ref^{commit}")" || { echo "référence inconnue : $ref" >&2; exit 1; } — en tête du script, avant git archive et ssh.'
];

export const points = 100;
