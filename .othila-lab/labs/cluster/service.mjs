import { assert } from '@othila-academy/lab';
import { APP, appDeployment, fromAppPod, kget } from '../../shared/kubectl.mjs';

export const title = 'Un nom stable dans le cluster';
export const explain = "Pourquoi ne pas appeler directement l'adresse IP du pod ?";
export const instructions = `Un pod est jetable : il change d'adresse à chaque remplacement. Un Service lui donne un nom stable.
Écris project/k8s/service.yaml : un Service nommé reservations, de type ClusterIP, qui choisit les pods par
app.kubernetes.io/name: reservations, sur le port 80, vers le port 8080 des pods.
  kubectl apply -f project/k8s/
  kubectl get svc,endpointslices
Depuis le pod lui-même, le Service répond par son nom DNS :
  kubectl exec deploy/reservations -- node -e "fetch('http://reservations/health').then(r=>r.text()).then(console.log)"

À expliquer (npx lab submit cluster service) : pourquoi ne pas appeler directement l'adresse IP du pod ?`;

export const checks = [
  {
    id: 'service-endpoints',
    label: 'le Service reservations a des points de terminaison (des pods prêts derrière lui)',
    run: async (ctx) => {
      const ns = (await appDeployment()).metadata.namespace;
      ctx.state.ns = ns;
      const svc = await kget(['service', '-n', ns, APP]);
      assert(svc, `Attendu : un Service ${APP} dans l'espace de noms ${ns}. Constaté : absent.`);
      const slices = await kget(['endpointslices', '-n', ns, '-l', `kubernetes.io/service-name=${APP}`]);
      const ready = (slices?.items ?? []).flatMap((s) => s.endpoints ?? []).filter((e) => e.conditions?.ready);
      assert(ready.length > 0, `Attendu : au moins un point de terminaison prêt. Constaté : aucun. Le sélecteur du Service correspond-il aux labels des pods ? kubectl get pods --show-labels.`);
    }
  },
  {
    id: 'service-repond',
    label: 'http://reservations/health répond depuis le cluster',
    run: async (ctx) => {
      const ns = ctx.state.ns ?? (await appDeployment()).metadata.namespace;
      const r = await fromAppPod(ns, `http://${APP}/health`);
      assert(r.status === 200, `Attendu : HTTP 200 par le nom du Service, port 80. Constaté : ${r.error ?? `HTTP ${r.status}`}. port: 80 et targetPort: 8080 ?`);
    }
  }
];

export const hints = [
  'Que montre kubectl get endpointslices ? Un Service sans point de terminaison ne trouve aucun pod.',
  'spec.selector du Service doit reprendre exactement les labels des pods ; port: 80 est celui du Service, targetPort: 8080 celui du conteneur.',
  'apiVersion: v1, kind: Service, metadata.name: reservations, spec: { selector: { app.kubernetes.io/name: reservations }, ports: [{ port: 80, targetPort: 8080 }] }.'
];

export const points = 100;
