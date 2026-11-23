import { assert } from '@othila-academy/lab';
import { deploy, health, requireServer, servesHead } from '../../shared/serveurs.mjs';

export const title = 'Rejouer le déploiement';
export const explain = "Qu'est-ce qui, dans ton script, aurait pu casser au second passage ?";
export const instructions = `Un déploiement se relance : après un échec réseau, pour remettre un serveur d'aplomb, ou par erreur.
Lance ton script deux fois de suite sur la même référence :
  project/deploy/deploy.sh HEAD && project/deploy/deploy.sh HEAD
Le second passage doit réussir et laisser le service dans le même état. Pièges courants : un dossier créé par mkdir
sans -p, un fichier ajouté au lieu d'être remplacé (>> au lieu de >), un ancien code laissé à côté du nouveau.
Le check relance lui-même ton script : compte une minute.

À expliquer (npx lab submit script rejouer) : qu'est-ce qui, dans ton script, aurait pu casser au second passage ?`;

export const checks = [
  {
    id: 'second-passage',
    label: 'relancé sur HEAD, le script réussit encore (le check le lance, 150 s au plus)',
    run: async () => {
      await requireServer('srv-test');
      const result = await deploy('HEAD');
      assert(result.code === 0, `Attendu : deploy.sh HEAD sort avec le code 0. Constaté : ${result.summary}`);
    }
  },
  {
    id: 'service-intact',
    label: 'après ce second passage, srv-test sert toujours le commit courant',
    run: async () => {
      await requireServer('srv-test');
      await health('srv-test');
      await servesHead('srv-test');
    }
  }
];

export const hints = [
  'Lance ton script deux fois de suite : à quelle ligne s’arrête le second passage, et que dit le message ?',
  'Ce qui doit être remplacé l’est en entier : vider /opt/reservations avant d’y extraire le code, écrire le fichier d’environnement avec > et non >>, mkdir -p.',
  'Côté serveur : ssh … "rm -rf /opt/reservations/* && tar -xz -C /opt/reservations" ; côté poste, mktemp -d et trap \'rm -rf "$work"\' EXIT.'
];

export const points = 100;
