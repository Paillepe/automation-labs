import { assert } from '@othila-academy/lab';
import { ansible, groupHosts } from '../../shared/ansible.mjs';
import { tail } from '../../shared/run.mjs';

export const title = "Décrire et joindre les serveurs";
export const explain = "Pourquoi Ansible n'a-t-il besoin de rien installer sur srv-web-1 pour le configurer ?";
export const instructions = `Terraform a créé srv-web-1 et srv-web-2 : demande-leur ce qu'ils servent.
  curl http://srv-web-1:8080/health
Écris project/ansible/inventory.ini : un groupe [web] avec les deux serveurs, par leur nom. Puis :
  cd project/ansible
  export ANSIBLE_CONFIG=$PWD/ansible.cfg
  ansible-inventory --graph
  ansible web -m ansible.builtin.ping
Repère : ansible.cfg dit déjà quel utilisateur (deploy) et quelle clé (~/.ssh/usine_lab) utiliser. Si les serveurs
sont injoignables par leur nom : usine up infra rattache le devcontainer au réseau front.

À expliquer (npx lab submit ansible inventaire) : pourquoi Ansible n'a-t-il besoin de rien installer sur srv-web-1 pour le configurer ?`;

export const prediction = {
  promptId: 'ansible-serveurs-vides',
  question: 'terraform apply a créé srv-web-1. Que répond http://srv-web-1:8080/health ?',
  choices: ['200', '503', 'rien : connexion refusée'],
  expected: 'rien : connexion refusée'
};

export const checks = [
  {
    id: 'groupe-web',
    label: "l'inventaire a un groupe web avec srv-web-1 et srv-web-2",
    run: async () => {
      const hosts = await groupHosts('web');
      const missing = ['srv-web-1', 'srv-web-2'].filter((h) => !hosts.includes(h));
      assert(missing.length === 0, `Attendu : srv-web-1 et srv-web-2 dans le groupe web. Constaté : ${hosts.join(', ') || 'groupe web vide ou absent'}.`);
    }
  },
  {
    id: 'ping-web',
    label: 'ansible web -m ping joint les deux serveurs en SSH',
    run: async () => {
      await groupHosts('web');
      const { code, stdout, stderr } = await ansible('ansible', ['web', '-m', 'ansible.builtin.ping', '-o']);
      assert(code === 0, `Attendu : SUCCESS pour chaque serveur. Constaté : ${tail(stdout || stderr, 2)}. usine up infra, puis relance.`);
    }
  }
];

export const hints = [
  'Comment s’appellent les serveurs que Terraform a créés ? docker ps, ou terraform output.',
  'Un fichier INI : une ligne [web], puis un nom de serveur par ligne. ansible-inventory --graph montre ce qu’Ansible a compris.',
  'project/ansible/inventory.ini : [web] puis srv-web-1 et srv-web-2 ; export ANSIBLE_CONFIG=$PWD/ansible.cfg ; ansible web -m ansible.builtin.ping.'
];

export const points = 50;
