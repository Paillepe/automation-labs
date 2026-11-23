import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { ANSIBLE, ansible } from '../../shared/ansible.mjs';
import { get, seen } from '../../shared/http.mjs';

const VAULT = 'group_vars/web/vault.yml';

export const title = 'Chiffrer le mot de passe';
export const explain = 'Le fichier est chiffré et commité. Qu’est-ce qu’un attaquant qui clone ton dépôt peut encore apprendre ?';
export const instructions = `Le mot de passe de la base est en clair dans ton dépôt, public. Range-le dans un fichier chiffré :
  1. project/ansible/${VAULT} : vault_db_password: <le mot de passe> ;
  2. ansible-vault encrypt ${VAULT}   (la clé est désignée par ansible.cfg : vault_password_file) ;
  3. dans group_vars/web/vars.yml : db_password: "{{ vault_db_password }}" ;
  4. ansible-playbook site.yml : rien ne doit changer sur les serveurs.
Vérifie : cat ${VAULT} n'affiche qu'un bloc chiffré ; ansible-vault view ${VAULT} l'affiche en clair.
Commite. Repère : la clé de Vault du cours est dans infra/keys/ (une clé de LAB) ; dans une vraie équipe, elle vit
hors du dépôt.

À expliquer (npx lab submit ansible secret) : le fichier est chiffré et commité. Qu'est-ce qu'un attaquant qui clone ton dépôt peut encore apprendre ?`;

export const checks = [
  {
    id: 'vault-chiffre',
    label: `project/ansible/${VAULT} est chiffré par Ansible Vault`,
    run: async () => {
      const file = path.join(ANSIBLE, VAULT);
      assert(existsSync(file), `Attendu : project/ansible/${VAULT}. Constaté : absent.`);
      assert(readFileSync(file, 'utf8').startsWith('$ANSIBLE_VAULT;'), `Attendu : un fichier chiffré ($ANSIBLE_VAULT;…). Constaté : lisible en clair. ansible-vault encrypt ${VAULT}.`);
    }
  },
  {
    id: 'vault-utilise',
    label: 'Ansible déchiffre le secret avec la clé du cours et en tire le mot de passe de la base',
    run: async () => {
      const { code, stdout, stderr } = await ansible('ansible-inventory', ['--host', 'srv-web-1']);
      assert(code === 0, `Attendu : Ansible lit les variables de srv-web-1. Constaté : ${stderr.trim().split('\n').pop()}. Le fichier est-il chiffré avec la clé de ansible.cfg ?`);
      const vars = JSON.parse(stdout);
      assert('vault_db_password' in vars, 'Attendu : une variable vault_db_password, venue du fichier chiffré. Constaté : absente.');
      assert('db_password' in vars, 'Attendu : db_password, définie dans group_vars/web/vars.yml. Constaté : absente.');
    }
  },
  {
    id: 'ready-apres-vault',
    label: 'srv-web-1 est toujours prêt (/ready vert)',
    run: async () => {
      const r = await get('http://srv-web-1:8080/ready');
      assert(r.status === 200, `Attendu : /ready en HTTP 200. Constaté : ${seen(r)}. Relance ansible-playbook site.yml.`);
    }
  }
];

export const hints = [
  'Quelle commande d’Ansible chiffre un fichier, et où ansible.cfg dit-il que se trouve la clé ?',
  'Un fichier de variables chiffré se charge comme un autre s’il est dans group_vars/web/ ; une variable peut en citer une autre : db_password: "{{ vault_db_password }}".',
  `printf 'vault_db_password: lab-db-password\\n' > ${VAULT} ; ansible-vault encrypt ${VAULT} ; vars.yml : db_password: "{{ vault_db_password }}" ; ansible-playbook site.yml.`
];

export const points = 75;
