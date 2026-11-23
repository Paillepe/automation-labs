export const title = 'Gestion de configuration';
export const steps = ['inventaire', 'deployer', 'rejouer', 'secret', 'lint'];
export const duration = '1 h 15';
export const summary = `Terraform a créé deux serveurs web et une base : des machines décrites, mais vides. Il reste à les configurer et à
y déployer l'application. C'est le lab script refait proprement, sur deux machines : Ansible décrit l'état voulu de
chaque serveur (ce paquet installé, ce fichier écrit, ce service démarré) et ne change que ce qui diffère.

Vocabulaire : l'inventaire liste les machines, rangées en groupes ; un playbook associe des groupes à des rôles ;
un rôle (tasks, handlers, templates, defaults) regroupe ce qui configure un service ; une tâche appelle un module
(apt, copy, template, service…) ; un handler ne tourne que si une tâche l'a notifié, par exemple pour redémarrer
après un changement de configuration. Idempotence : un second passage n'annonce aucun changement. Les modules la
garantissent ; shell et command, non (d'où creates: et changed_when:).
Ansible Vault chiffre un fichier de variables : le mot de passe de la base est versionné, mais illisible sans la clé.

Ansible pousse sa configuration par SSH, sans agent sur les serveurs. Puppet et Chef font l'inverse : un agent sur
chaque machine tire sa configuration d'un serveur central. Frontière avec Terraform : Terraform crée les machines,
Ansible configure ce qu'il y a dedans. Infrastructure mutable (on modifie des serveurs qui durent, ce lab) ou
immuable (on remplace une image, les labs cluster et suivants).

Fourni : ansible.cfg, la clé de lab, le squelette du rôle project/ansible/roles/reservations/, dans l'ordre de
deploy.sh. Correspondance (couture avec le lab script) :
  deploy.sh : git rev-parse, git archive      → tâche 1, archive fabriquée sur le poste (delegate_to: localhost)
  deploy.sh : npm ci, lint, tests              → tâche 2, paquets et utilisateur (le pipeline teste déjà)
  deploy.sh : tar … | ssh … tar -x             → tâche 3, copy puis unarchive
  deploy.sh : printf … > reservations.env      → tâche 4, template
  deploy.sh : sudo service … restart           → tâche 5, handler notifié, puis service started
  deploy.sh : curl --retry …/health            → tâche 6, uri sur /ready avec retries
Node.js est déjà sur les serveurs : rien à installer.
Commandes, depuis project/ansible/ : export ANSIBLE_CONFIG=$PWD/ansible.cfg (une fois par terminal).
Les cinq étapes sont le socle. Pistes sans check : mise à jour serveur par serveur (serial: 1), un reverse proxy
devant les deux serveurs.
Après npx lab catchup ansible : usine rebuild.`;
export const objectives = [
  'décrire ses serveurs dans un inventaire et les joindre en SSH',
  'porter un script de déploiement dans un rôle Ansible, tâche par tâche',
  'obtenir un second passage sans aucun changement',
  'versionner un secret chiffré par Ansible Vault'
];
