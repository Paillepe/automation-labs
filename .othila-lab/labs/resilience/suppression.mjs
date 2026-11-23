import { assert } from '@othila-academy/lab';
import { APP, INGRESS_URL, appDeployment, kget, kubectl } from '../../shared/kubectl.mjs';
import { attendre } from '../../shared/attendre.mjs';
import { resume, sousTrafic } from '../../shared/trafic.mjs';

export const title = 'Perdre un pod sans perdre de requête';
export const explain = 'Pendant ce check, qui a cessé d’envoyer du trafic au pod supprimé, et à quel moment ?';
export const instructions = `Envoie du trafic, et supprime un pod pendant ce temps :
  while true; do curl -s -o /dev/null -w '%{http_code} ' http://k3d-usine-serverlb/version; sleep 0.1; done
  (dans un second terminal) kubectl delete pod <un des pods>
Attendu : que des 200. Le check fait la même chose : du trafic par l'Ingress, la suppression d'un pod, puis
il attend que les 3 réplicas soient de nouveau prêts (compte 30 s).

À expliquer (npx lab submit resilience suppression) : pendant ce check, qui a cessé d'envoyer du trafic au pod supprimé, et à quel moment ?`;

export const checks = [
  {
    id: 'suppression-sans-echec',
    label: 'un pod supprimé sous trafic : aucune requête en échec par l’Ingress (le check supprime le pod)',
    run: async () => {
      const d = await appDeployment();
      const ns = d.metadata.namespace;
      assert(d.spec.replicas >= 3, `Attendu : au moins 3 réplicas avant de supprimer un pod. Constaté : ${d.spec.replicas}. Étape replicas d'abord.`);
      const pods = await kget(['pods', '-n', ns, '-l', `app.kubernetes.io/name=${APP}`]);
      const victim = pods?.items?.find((p) => !p.metadata.deletionTimestamp)?.metadata.name;
      assert(victim, `Attendu : des pods étiquetés app.kubernetes.io/name=${APP}. Constaté : aucun.`);
      const run = await sousTrafic(() => kubectl(['delete', 'pod', '-n', ns, victim, '--wait=false']), { url: INGRESS_URL });
      assert(run.total > 20, `Attendu : du trafic par ${INGRESS_URL}. Constaté : ${resume(run)}.`);
      assert(run.echecs.length === 0, `Attendu : aucune requête en échec pendant la suppression de ${victim}. Constaté : ${resume(run)}. Combien de réplicas, et une readinessProbe ?`);
      await attendre(async () => (await appDeployment()).status?.readyReplicas >= d.spec.replicas, { delai: 60, attendu: `${d.spec.replicas} réplicas prêts après la suppression`, constat: () => 'pas encore' });
    }
  }
];

export const hints = [
  'Avec un seul réplica, que reste-t-il pour répondre pendant que le pod est remplacé ?',
  'Il faut plusieurs réplicas, et une readinessProbe pour que le Service n’envoie du trafic qu’aux pods prêts.',
  'replicas: 3 et readinessProbe: { httpGet: { path: /ready, port: 8080 }, periodSeconds: 2 } ; kubectl apply -f project/k8s/, puis relance le check.'
];

export const points = 100;
