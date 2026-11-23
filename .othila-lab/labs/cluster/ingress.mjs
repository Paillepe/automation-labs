import { assert } from '@othila-academy/lab';
import { get, seen } from '../../shared/http.mjs';
import { INGRESS_URL, requireCluster } from '../../shared/kubectl.mjs';
import { pause } from '../../shared/attendre.mjs';

// Traefik prend une nouvelle route en quelques secondes : tant qu'il répond 404 ou 503, on attend (30 s au plus).
async function viaIngress(path) {
  let r;
  for (let i = 0; i < 15; i += 1) {
    r = await get(`${INGRESS_URL}${path}`);
    if (r.status && r.status !== 404 && r.status !== 503) return r;
    await pause(2000);
  }
  return r;
}

export const title = "Ouvrir l'application à l'extérieur";
export const explain = "Qui lit ton objet Ingress, et que fait-il de ce qu'il y lit ?";
export const instructions = `Écris project/k8s/ingress.yaml : un Ingress nommé reservations, qui envoie tout le chemin / (pathType Prefix)
vers le Service reservations, port 80. Le contrôleur Ingress du cluster est Traefik (ingressClassName: traefik).
  kubectl apply -f project/k8s/
  curl http://k3d-usine-serverlb/version          depuis le devcontainer
  curl http://k3d-usine-serverlb/ready
Depuis le navigateur du poste : http://127.0.0.1:18480/version. /ready vert : l'application parle à la base du cluster.

À expliquer (npx lab submit cluster ingress) : qui lit ton objet Ingress, et que fait-il de ce qu'il y lit ?`;

export const checks = [
  {
    id: 'ingress-version',
    label: "une requête passant par l'Ingress atteint l'application (/version, jusqu'à 30 s)",
    run: async () => {
      await requireCluster();
      const r = await viaIngress('/version');
      assert(r.status === 200 && r.json?.service === 'reservations', `Attendu : /version de l'application par ${INGRESS_URL}. Constaté : ${seen(r)}${r.status === 404 ? ' (Traefik ne connaît aucune route : ton Ingress est-il appliqué ?)' : ''}.`);
    }
  },
  {
    id: 'ingress-ready',
    label: "par l'Ingress, /ready est vert : l'application est connectée à la base du cluster",
    run: async () => {
      await requireCluster();
      const r = await viaIngress('/ready');
      assert(r.status === 200, `Attendu : /ready en HTTP 200. Constaté : ${seen(r)}${r.json?.reason ? ` (${r.json.reason})` : ''}. DB_HOST=db.data et le mot de passe de la fiche ?`);
    }
  }
];

export const hints = [
  'Que répond curl -i http://k3d-usine-serverlb/ ? Un 404 de Traefik veut dire : aucune route ne correspond.',
  'apiVersion: networking.k8s.io/v1, kind: Ingress ; une règle sans host, un chemin / de type Prefix, un backend service reservations port 80.',
  'spec: { ingressClassName: traefik, rules: [{ http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: reservations, port: { number: 80 } } } }] } }] }.'
];

export const points = 100;
