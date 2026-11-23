import { assert } from '@othila-academy/lab';
import { APP, appDeployment, kget, kubectl } from '../../shared/kubectl.mjs';
import { attendre } from '../../shared/attendre.mjs';

const restarts = (pod) => (pod?.status?.containerStatuses ?? []).reduce((n, c) => n + (c.restartCount ?? 0), 0);

export const title = 'Un processus figé est redémarré';
export const explain = 'Le pod figé était-il encore « Running » pour Kubernetes ? Qu’est-ce qui l’a trahi ?';
export const instructions = `Un processus peut rester là sans plus rien faire : figé. Seule une sonde de vivacité le voit.
Fige un pod (le jeton est celui de FAULT_TOKEN, lab-fault-token) :
  kubectl exec <pod> -- node -e "fetch('http://localhost:8080/fault/freeze',{method:'POST',headers:{'X-Fault-Token':'lab-fault-token'}}).then(r=>console.log(r.status))"
  kubectl get pods -w          la colonne RESTARTS passe à 1
  kubectl describe pod <pod>   les Events disent « Liveness probe failed »
Le check fige un pod lui-même, puis attend son redémarrage par le kubelet (jusqu'à 60 s).

À expliquer (npx lab submit resilience gel) : le pod figé était-il encore « Running » pour Kubernetes ? Qu'est-ce qui l'a trahi ?`;

export const checks = [
  {
    id: 'gel-redemarre',
    label: 'un pod figé (point d’injection) est redémarré par Kubernetes (le check le fige, 60 s au plus)',
    run: async () => {
      const d = await appDeployment();
      const ns = d.metadata.namespace;
      const env = d.spec.template.spec.containers[0].env ?? [];
      const token = env.find((e) => e.name === 'FAULT_TOKEN')?.value;
      assert(token, 'Attendu : la variable FAULT_TOKEN dans le Deployment (lab-fault-token). Constaté : absente. Sans elle, l’injection de pannes est désactivée.');
      const pods = await kget(['pods', '-n', ns, '-l', `app.kubernetes.io/name=${APP}`]);
      const pod = pods?.items?.find((p) => !p.metadata.deletionTimestamp && p.status?.phase === 'Running');
      assert(pod, 'Attendu : un pod en marche. Constaté : aucun.');
      const before = restarts(pod);
      const script = `fetch('http://localhost:8080/fault/freeze',{method:'POST',headers:{'X-Fault-Token':${JSON.stringify(token)}}}).then(r=>console.log(r.status))`;
      const frozen = await kubectl(['exec', '-n', ns, pod.metadata.name, '--', 'node', '-e', script], { timeout: 15000 });
      assert(frozen.stdout.trim() === '202' || frozen.stdout.trim() === '200', `Attendu : le gel accepté. Constaté : ${frozen.stdout.trim() || frozen.stderr.trim()}. FAULT_TOKEN vaut-il lab-fault-token ?`);
      await attendre(async () => restarts(await kget(['pod', '-n', ns, pod.metadata.name])) > before, {
        delai: 60,
        attendu: `${pod.metadata.name} redémarré par sa livenessProbe`,
        constat: () => 'aucun redémarrage : la livenessProbe existe-t-elle, sur /health ?'
      });
    }
  }
];

export const hints = [
  'Un pod figé reste Running : qu’est-ce qui, dans ton Deployment, interroge régulièrement le processus lui-même ?',
  'Une livenessProbe httpGet sur /health : quand elle échoue failureThreshold fois de suite, le kubelet redémarre le conteneur.',
  'livenessProbe: { httpGet: { path: /health, port: 8080 }, initialDelaySeconds: 5, periodSeconds: 3, timeoutSeconds: 2, failureThreshold: 3 }.'
];

export const points = 100;
