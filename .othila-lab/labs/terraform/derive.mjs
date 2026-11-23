import { assert } from '@othila-academy/lab';
import { inspect, requireDocker } from '../../shared/docker.mjs';
import { plan } from '../../shared/terraform.mjs';

export const title = 'Détecter et corriger une dérive';
export const explain = 'D’où vient une dérive dans une vraie équipe, et pourquoi la corriger par apply plutôt qu’à la main ?';
export const instructions = `Quelqu'un « dépanne » l'infrastructure à la main, sans passer par le code :
  usine incident derive
Ne cherche pas avec docker : demande à Terraform ce qui a changé.
  cd project/infra && terraform plan
Lis le plan : quelles ressources, et pour chacune ~ (modifier sur place) ou + (créer). Puis remets la réalité en
conformité avec le code :
  terraform apply
  terraform plan -detailed-exitcode ; echo $?      0 de nouveau
Écris en deux lignes, pour ta correction, ce que le plan a montré.

À expliquer (npx lab submit terraform derive) : d'où vient une dérive dans une vraie équipe, et pourquoi la corriger par apply plutôt qu'à la main ?`;

export const checks = [
  {
    id: 'apres-derive-plan',
    label: "après la dérive et sa correction, terraform plan n'annonce plus aucun changement",
    run: async () => {
      const result = await plan();
      assert(result.code === 0, `Attendu : code 0, rien à faire. Constaté : ${result.summary}. Lis ce plan : c'est la dérive. terraform apply la corrige.`);
    }
  },
  {
    id: 'apres-derive-isolation',
    label: "srv-web-2 tourne de nouveau sur front et back, et db existe, sans aucun port publié",
    run: async () => {
      await requireDocker();
      const web = await inspect('srv-web-2');
      assert(web?.State?.Running, `Attendu : srv-web-2 démarré. Constaté : ${web ? web.State.Status : 'absent'}. terraform apply le remet comme le code le décrit.`);
      const nets = Object.keys(web?.NetworkSettings?.Networks ?? {});
      assert(nets.includes('front') && nets.includes('back'), `Attendu : srv-web-2 sur front et back. Constaté : ${nets.join(', ') || 'absent'}.`);
      const db = await inspect('db');
      const published = Object.values(db?.NetworkSettings?.Ports ?? {}).filter((b) => b?.length);
      assert(db && published.length === 0, `Attendu : db sans port publié. Constaté : ${db ? `${published.length} port(s) publié(s)` : 'db absente'}.`);
    }
  }
];

export const hints = [
  'Que dit terraform plan, ligne par ligne, juste après l’incident ? Les symboles ~, + et - disent modifier, créer, détruire.',
  'Le plan compare le code, le state et la réalité : un conteneur arrêté se lit en ~ (modifier), un conteneur disparu en + (créer). apply remet tout comme le code le décrit.',
  'cd project/infra ; terraform plan (lire) ; terraform apply ; terraform plan -detailed-exitcode doit rendre 0.'
];

export const points = 100;
