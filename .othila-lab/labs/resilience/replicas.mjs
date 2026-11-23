import { assert } from '@othila-academy/lab';
import { appDeployment, podTrouble } from '../../shared/kubectl.mjs';
import { attendre } from '../../shared/attendre.mjs';

const container = (d) => d.spec.template.spec.containers[0];

export const title = 'Trois réplicas, sondés et bornés';
export const explain = 'Ta readiness et ta liveness interrogent-elles le même chemin ? Pourquoi, ou pourquoi pas ?';
export const instructions = `Dans project/k8s/deployment.yaml :
  - replicas: 3 ;
  - une readinessProbe (httpGet sur /ready, port 8080) et une livenessProbe (httpGet sur /health) ;
  - des resources : requests (cpu, memory) et limits (memory au moins) ;
  - une stratégie RollingUpdate avec maxUnavailable: 0 et maxSurge: 1 ;
  - la variable FAULT_TOKEN=lab-fault-token (jeton de LAB), pour les pannes des étapes suivantes.
  kubectl apply -f project/k8s/ && kubectl rollout status deployment/reservations
  kubectl get pods -o wide ; kubectl describe deploy reservations
Repère : /ready dit « la base répond », /health dit « le processus répond ». Lequel doit faire redémarrer ?

À expliquer (npx lab submit resilience replicas) : ta readiness et ta liveness interrogent-elles le même chemin ? Pourquoi, ou pourquoi pas ?`;

export const prediction = {
  promptId: 'resilience-un-seul-pod',
  question: 'Un seul pod sert l’application. Tu le supprimes : combien de requêtes échouent pendant son remplacement ?',
  choices: ['aucune', 'quelques-unes'],
  expected: 'quelques-unes'
};

export const checks = [
  {
    id: 'trois-prets',
    label: '3 réplicas de reservations sont prêts (jusqu’à 120 s)',
    run: async () => {
      const ns = (await appDeployment()).metadata.namespace;
      await attendre(
        async () => {
          const d = await appDeployment();
          return d.spec.replicas >= 3 && d.status?.readyReplicas >= 3 && d.status?.updatedReplicas >= 3;
        },
        { delai: 120, attendu: '3 réplicas prêts', constat: async () => `${(await appDeployment()).status?.readyReplicas ?? 0} prêt(s) — ${await podTrouble(ns)}` }
      );
    }
  },
  {
    id: 'sondes',
    label: 'le conteneur a une readinessProbe et une livenessProbe',
    run: async () => {
      const c = container(await appDeployment());
      const missing = ['readinessProbe', 'livenessProbe'].filter((p) => !c[p]);
      assert(missing.length === 0, `Attendu : readinessProbe et livenessProbe. Constaté : il manque ${missing.join(', ')}.`);
    }
  },
  {
    id: 'ressources',
    label: 'le conteneur déclare des requests et une limite de mémoire',
    run: async () => {
      const r = container(await appDeployment()).resources ?? {};
      assert(r.requests?.cpu && r.requests?.memory, 'Attendu : resources.requests.cpu et resources.requests.memory. Constaté : absents.');
      assert(r.limits?.memory, 'Attendu : resources.limits.memory. Constaté : absente.');
    }
  }
];

export const hints = [
  'kubectl describe deploy reservations : que disent les lignes Replicas, Liveness, Readiness, Limits et Requests ?',
  'Les sondes et les ressources sont des champs du conteneur (au même niveau que image) ; la stratégie est un champ de spec du Deployment.',
  'readinessProbe: { httpGet: { path: /ready, port: 8080 }, periodSeconds: 2 } ; livenessProbe: { httpGet: { path: /health, port: 8080 }, periodSeconds: 3, failureThreshold: 3 } ; resources: { requests: { cpu: 50m, memory: 64Mi }, limits: { memory: 192Mi } }.'
];

export const points = 100;
