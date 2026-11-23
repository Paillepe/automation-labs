import { assert } from '@othila-academy/lab';
import { APP, appDeployment, kget } from '../../shared/kubectl.mjs';

export const title = 'Bonus — autoscaling et budget de perturbation';
export const explain = 'Que fait ton PodDisruptionBudget pendant un kubectl drain d’un nœud ?';
export const instructions = `Facultatif. Deux objets de production :
  - un HorizontalPodAutoscaler (autoscaling/v2) sur le Deployment reservations : de 3 à 6 réplicas, cible 70 % de CPU
    (il s'appuie sur les requests ; metrics-server est fourni par k3s) ;
  - un PodDisruptionBudget (policy/v1) : minAvailable: 2 sur les pods de l'application.
Autres pistes, sans check : une NetworkPolicy qui n'autorise la base que depuis l'application ; un conteneur non root
(securityContext: runAsNonRoot: true).

À expliquer (npx lab submit resilience bonus-production) : que fait ton PodDisruptionBudget pendant un kubectl drain d'un nœud ?`;

export const checks = [
  {
    id: 'hpa',
    label: 'un HorizontalPodAutoscaler vise le Deployment reservations',
    run: async () => {
      const ns = (await appDeployment()).metadata.namespace;
      const list = await kget(['hpa', '-n', ns]);
      assert((list?.items ?? []).some((h) => h.spec?.scaleTargetRef?.name === APP), `Attendu : un HPA sur ${APP}. Constaté : aucun dans ${ns}.`);
    }
  },
  {
    id: 'pdb',
    label: "un PodDisruptionBudget protège les pods de l'application",
    run: async () => {
      const ns = (await appDeployment()).metadata.namespace;
      const list = await kget(['pdb', '-n', ns]);
      const ok = (list?.items ?? []).some((p) => p.spec?.selector?.matchLabels?.['app.kubernetes.io/name'] === APP);
      assert(ok, `Attendu : un PDB sur app.kubernetes.io/name=${APP}. Constaté : aucun dans ${ns}.`);
    }
  }
];

export const hints = [
  'kubectl get hpa,pdb : qu’existe-t-il déjà ?',
  'Un HPA cite le Deployment par scaleTargetRef ; un PDB choisit les pods par un selector, comme un Service.',
  'hpa.yaml : apiVersion: autoscaling/v2, kind: HorizontalPodAutoscaler, scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: reservations }, minReplicas: 3, maxReplicas: 6 ; pdb.yaml : apiVersion: policy/v1, minAvailable: 2, selector.matchLabels.'
];

export const points = 50;
