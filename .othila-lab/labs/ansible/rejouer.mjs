import { assert } from '@othila-academy/lab';
import { playbook } from '../../shared/ansible.mjs';

export const title = 'Un second passage sans changement';
export const explain = 'Quelle tâche de ton rôle annonçait un changement à chaque passage, et pourquoi ?';
export const instructions = `Relance le playbook sans rien modifier :
  ansible-playbook site.yml
Le récapitulatif (PLAY RECAP) doit annoncer changed=0 sur les deux serveurs : rien n'a été refait, rien n'a été
redémarré. Une tâche toujours « changed » est le signe d'une commande qui ne sait pas dire si elle a agi : shell ou
command sans creates:, un fichier réécrit à chaque fois, un redémarrage inconditionnel.
Le check relance lui-même ton playbook : compte une minute.

À expliquer (npx lab submit ansible rejouer) : quelle tâche de ton rôle annonçait un changement à chaque passage, et pourquoi ?`;

export const checks = [
  {
    id: 'zero-changement',
    label: 'un nouveau passage du playbook annonce zéro changement (le check le lance, 240 s au plus)',
    run: async () => {
      const result = await playbook();
      assert(result.code === 0, `Attendu : un passage sans erreur. Constaté : code ${result.code} — ${result.summary}`);
      const hosts = Object.entries(result.recap);
      assert(hosts.length >= 2, `Attendu : un récapitulatif pour les deux serveurs. Constaté : ${hosts.map(([h]) => h).join(', ') || 'aucun'}.`);
      const changed = hosts.filter(([, r]) => r.changed > 0);
      assert(changed.length === 0, `Attendu : changed=0 partout. Constaté : ${changed.map(([h, r]) => `${h} changed=${r.changed}`).join(', ')}. ansible-playbook site.yml --diff montre ce qui change.`);
    }
  }
];

export const hints = [
  'Lance ansible-playbook site.yml deux fois : quelles tâches sont « changed » au second passage ?',
  'Une commande shell doit dire quand elle n’a rien à faire : creates: (un fichier qu’elle produit) ou changed_when:. Un redémarrage passe par un handler, jamais par state: restarted dans les tâches.',
  'L’archive : shell avec creates: "{{ build_archive }}" ; le redémarrage : notify: Redémarrer reservations, et ansible.builtin.service avec state: started (et non restarted) dans les tâches.'
];

export const points = 100;
