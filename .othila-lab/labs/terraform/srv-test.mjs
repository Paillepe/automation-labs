import { assert } from '@othila-academy/lab';
import { inspect, requireDocker } from '../../shared/docker.mjs';

export const title = 'Supprimer srv-test';
export const explain = "Qu'est-ce qui, dans ton dépôt, aurait permis de refaire srv-test à l'identique ? Qu'en conclus-tu ?";
export const instructions = `Qui sait refaire srv-test à l'identique ? Cherche dans project/ ce qui le décrit. Puis supprime-le :
  usine down servers
Il ne reviendra pas : les serveurs de la suite du cours seront décrits dans project/infra/. Prépare le dossier et
lis le premier plan, celui du squelette :
  cd project/infra
  terraform init
  terraform plan
Repère : init ne télécharge rien (le provider est dans l'environnement) ; plan annonce deux images à créer, celles
que fournit images.tf. N'applique pas encore.

À expliquer (npx lab submit terraform srv-test) : qu'est-ce qui, dans ton dépôt, aurait permis de refaire srv-test à l'identique ? Qu'en conclus-tu ?`;

export const prediction = {
  promptId: 'terraform-refaire-srv-test',
  question: 'srv-test a été créé par usine up servers. Ton dossier project/ contient-il de quoi le recréer à l’identique ?',
  choices: ['oui', 'non'],
  expected: 'non'
};

export const checks = [
  {
    id: 'srv-test-supprime',
    label: "srv-test n'existe plus",
    run: async () => {
      await requireDocker();
      const info = await inspect('srv-test');
      assert(!info, `Attendu : plus de conteneur srv-test. Constaté : srv-test ${info?.State?.Status}. Lance usine down servers.`);
    }
  }
];

export const hints = [
  'Quelle commande usine arrête et supprime une cible ? usine help.',
  'usine down <cible> ; la cible de srv-test s’appelle servers.',
  'usine down servers, puis cd project/infra && terraform init && terraform plan.'
];

export const points = 25;
