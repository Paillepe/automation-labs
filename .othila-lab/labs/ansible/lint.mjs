import { assert } from '@othila-academy/lab';
import { ansible, requireFile } from '../../shared/ansible.mjs';
import { tail } from '../../shared/run.mjs';

export const title = 'Passer ansible-lint';
export const explain = 'Choisis une règle d’ansible-lint : quel problème réel évite-t-elle ?';
export const instructions = `ansible-lint relit playbooks et rôles : syntaxe, noms de modules complets (ansible.builtin.copy), tâches nommées,
commandes shell risquées.
  ansible-lint --profile min site.yml
Le socle demande le profil minimal. Essaie ensuite --profile production : jusqu'où ton rôle tient-il ?

À expliquer (npx lab submit ansible lint) : choisis une règle d'ansible-lint : quel problème réel évite-t-elle ?`;

export const checks = [
  {
    id: 'ansible-lint-min',
    label: 'ansible-lint --profile min passe sur site.yml et le rôle',
    run: async () => {
      requireFile('site.yml');
      const { code, stdout, stderr } = await ansible('ansible-lint', ['--profile', 'min', '--nocolor', 'site.yml'], 120000);
      assert(code === 0, `Attendu : 0 échec. Constaté : ${tail(stderr || stdout, 3)}`);
    }
  }
];

export const hints = [
  'Que dit ansible-lint --profile min site.yml, et quelle règle cite chaque ligne ?',
  'Le profil min ne refuse que ce qu’Ansible ne sait pas lire : une erreur de YAML, un module inconnu, une clé mal placée.',
  'Lance ansible-playbook site.yml --syntax-check : il pointe la ligne fautive ; corrige l’indentation ou le nom du module (ansible.builtin.<module>).'
];

export const points = 50;
