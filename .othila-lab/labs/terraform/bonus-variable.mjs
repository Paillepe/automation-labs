import { assert } from '@othila-academy/lab';
import { plan } from '../../shared/terraform.mjs';

export const title = 'Bonus — le nombre de serveurs en variable';
export const explain = 'Que se passerait-il au plan si tu passais de count à for_each sur des serveurs déjà créés ?';
export const instructions = `Facultatif. Le nombre de serveurs web se règle par la variable web_count (variables.tf, défaut 2) :
remplace le 2 de ton count par var.web_count. Vérifie sans rien appliquer :
  terraform plan -var web_count=3       Plan: 1 to add (srv-web-3)
Autres pistes, sans check : un module réutilisable (modules/serveur-web), un inventaire Ansible généré depuis
l'output web_servers.

À expliquer (npx lab submit terraform bonus-variable) : que se passerait-il au plan si tu passais de count à for_each sur des serveurs déjà créés ?`;

export const checks = [
  {
    id: 'web-count-3',
    label: 'terraform plan -var web_count=3 annonce un seul serveur à ajouter',
    run: async () => {
      const result = await plan(['-var', 'web_count=3']);
      assert(/Plan: 1 to add, 0 to change, 0 to destroy/.test(result.stdout), `Attendu : « Plan: 1 to add, 0 to change, 0 to destroy ». Constaté : ${result.summary}.`);
    }
  }
];

export const hints = [
  'Où le nombre de serveurs est-il écrit dans ton code ?',
  'count accepte une expression : une variable déclarée dans variables.tf s’utilise par var.<nom>.',
  'count = var.web_count dans docker_container "web" ; terraform plan -var web_count=3 doit annoncer 1 to add.'
];

export const points = 50;
