import { assert } from '@othila-academy/lab';
import { appDeployment, fromAppPod, podTrouble } from '../../shared/kubectl.mjs';
import { attendre } from '../../shared/attendre.mjs';

export const title = "Lancer l'application dans le cluster";
export const explain = 'Tu supprimes le pod à la main (kubectl delete pod …). Que se passe-t-il, et quel composant en décide ?';
export const instructions = `Démarre le cluster et charge-y la version publiée par ton pipeline au lab livraison :
  usine up cluster
  usine release 1.0.0          lis sa sortie : image de ton registre, ou construite en local ?
  kubectl get nodes ; kubectl get pods -n data
Écris project/k8s/deployment.yaml : un Deployment nommé reservations, 1 réplica, des pods étiquetés
app.kubernetes.io/name: reservations (le sélecteur et le gabarit portent ce label), un conteneur sur l'image
reservations:1.0.0 avec imagePullPolicy: Never (l'image est déjà dans le cluster : on ne la cherche pas sur Internet),
le port 8080, et l'environnement de la base : DB_HOST=db.data, DB_PASSWORD=lab-cluster-password.
  kubectl apply -f project/k8s/
  kubectl get deploy,rs,pods
  kubectl logs deploy/reservations
Supprime ensuite le pod à la main (kubectl delete pod <nom>) et regarde kubectl get pods -w.

À expliquer (npx lab submit cluster deployer) : tu supprimes le pod à la main. Que se passe-t-il, et quel composant en décide ?`;

export const prediction = {
  promptId: 'cluster-serveur-tombe',
  question: 'docker stop srv-web-1 : que devient le trafic que les utilisateurs envoyaient à srv-web-1 ?',
  choices: ['il bascule sur srv-web-2', 'il est perdu'],
  expected: 'il est perdu'
};

export const checks = [
  {
    id: 'deployment-disponible',
    label: 'le Deployment reservations est disponible (jusqu’à 120 s)',
    run: async () => {
      const first = await appDeployment();
      const ns = first.metadata.namespace;
      await attendre(
        async () => {
          const d = await appDeployment();
          return d.status?.availableReplicas >= 1 && d.status?.updatedReplicas === d.status?.replicas;
        },
        { delai: 120, attendu: 'au moins un pod disponible', constat: () => podTrouble(ns) }
      );
    }
  },
  {
    id: 'image-du-pipeline',
    label: 'ses pods tournent sur l’image reservations:<version> chargée par usine release',
    run: async () => {
      const d = await appDeployment();
      const images = d.spec.template.spec.containers.map((c) => c.image);
      assert(images.some((i) => /(^|\/)reservations:\d/.test(i)), `Attendu : une image reservations:<version> (ex. reservations:1.0.0). Constaté : ${images.join(', ')}.`);
    }
  },
  {
    id: 'version-servie',
    label: '/version, dans le pod, renvoie la version citée par le manifest',
    run: async () => {
      const d = await appDeployment();
      const tag = /reservations:([^@\s]+)/.exec(d.spec.template.spec.containers.map((c) => c.image).join(' '))?.[1];
      const r = await fromAppPod(d.metadata.namespace, 'http://localhost:8080/version');
      assert(!r.error, `Attendu : une réponse de /version dans le pod. Constaté : ${r.error}.`);
      const body = JSON.parse(r.body);
      assert(body.version === tag, `Attendu : version ${tag}. Constaté : ${body.version} (commit ${String(body.commit).slice(0, 12)}). usine release ${tag}, puis kubectl rollout restart deployment/reservations.`);
    }
  }
];

export const hints = [
  'Que disent kubectl get pods et kubectl describe pod <nom> ? La section Events, en bas, donne la raison d’un pod qui ne démarre pas.',
  'apiVersion: apps/v1, kind: Deployment ; spec.selector.matchLabels doit correspondre à spec.template.metadata.labels ; l’image doit avoir été chargée par usine release.',
  'containers: - name: reservations, image: reservations:1.0.0, imagePullPolicy: Never, ports: - containerPort: 8080, env: - {name: DB_HOST, value: db.data} - {name: DB_PASSWORD, value: lab-cluster-password}.'
];

export const points = 125;
