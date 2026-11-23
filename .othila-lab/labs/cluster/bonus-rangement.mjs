import { assert } from '@othila-academy/lab';
import { appDeployment } from '../../shared/kubectl.mjs';

export const title = 'Bonus — un espace de noms et des labels recommandés';
export const explain = "À quoi sert un espace de noms dédié quand plusieurs équipes partagent un cluster ?";
export const instructions = `Facultatif. Range l'application dans son propre espace de noms (un fichier namespace.yaml, et metadata.namespace
dans chaque objet), et ajoute aux objets les labels recommandés : app.kubernetes.io/name, app.kubernetes.io/part-of
(valmorin), app.kubernetes.io/version. Supprime ensuite les anciens objets de default : kubectl delete -f … avant de
changer les fichiers, ou kubectl delete deploy,svc,ingress reservations -n default.
Autre piste, sans check : la configuration (DB_HOST, LOG_LEVEL) dans une ConfigMap, lue par envFrom.

À expliquer (npx lab submit cluster bonus-rangement) : à quoi sert un espace de noms dédié quand plusieurs équipes partagent un cluster ?`;

export const checks = [
  {
    id: 'espace-dedie',
    label: "le Deployment reservations vit dans un espace de noms dédié (pas default)",
    run: async () => {
      const ns = (await appDeployment()).metadata.namespace;
      assert(ns !== 'default', 'Attendu : un espace de noms à part. Constaté : default.');
    }
  },
  {
    id: 'labels-recommandes',
    label: 'le Deployment porte les labels app.kubernetes.io/name, part-of et version',
    run: async () => {
      const labels = (await appDeployment()).metadata.labels ?? {};
      const missing = ['name', 'part-of', 'version'].map((k) => `app.kubernetes.io/${k}`).filter((k) => !labels[k]);
      assert(missing.length === 0, `Attendu : ${missing.join(', ')}. Constaté : absents.`);
    }
  }
];

export const hints = [
  'kubectl get deploy -A --show-labels : où est ton Deployment, avec quels labels ?',
  'Un objet Namespace, puis metadata.namespace dans chaque manifest ; les labels se posent dans metadata.labels.',
  '00-namespace.yaml (appliqué en premier : kubectl apply suit l’ordre alphabétique) : kind: Namespace, metadata.name: valmorin ; dans chaque objet : namespace: valmorin et labels: { app.kubernetes.io/name: reservations, app.kubernetes.io/part-of: valmorin, app.kubernetes.io/version: "1.0.0" }.'
];

export const points = 50;
