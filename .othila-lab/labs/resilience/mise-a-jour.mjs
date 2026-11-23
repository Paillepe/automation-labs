import { assert } from '@othila-academy/lab';
import { INGRESS_URL, appDeployment, kubectl } from '../../shared/kubectl.mjs';
import { resume, sousTrafic } from '../../shared/trafic.mjs';
import { get } from '../../shared/http.mjs';

const VERSION = '1.1.0';

export const title = 'Livrer 1.1.0 sous trafic';
export const explain = 'Pendant la mise à jour, combien de pods tournaient au plus, et pourquoi jamais moins de trois prêts ?';
export const instructions = `La nouvelle version part d'un tag Git, comme au lab livraison :
  git tag v${VERSION} && git push origin v${VERSION}       puis gh run watch : le pipeline publie l'image ${VERSION}
  usine release ${VERSION}                                  elle est chargée dans le cluster : reservations:${VERSION}
Dans project/k8s/deployment.yaml, l'image passe à reservations:${VERSION}. Lance du trafic, puis :
  kubectl apply -f project/k8s/ && kubectl rollout status deployment/reservations
  curl http://k3d-usine-serverlb/version             → ${VERSION}
Commite et pousse. Le check vérifie la version servie, puis relance lui-même un déploiement complet sous trafic
(kubectl rollout restart) et compte les requêtes en échec : compte une minute.

À expliquer (npx lab submit resilience mise-a-jour) : pendant la mise à jour, combien de pods tournaient au plus, et pourquoi jamais moins de trois prêts ?`;

export const checks = [
  {
    id: 'version-1-1-0',
    label: `par l'Ingress, l'application répond en version ${VERSION}`,
    run: async () => {
      const d = await appDeployment();
      const image = d.spec.template.spec.containers[0].image;
      assert(image.endsWith(`reservations:${VERSION}`), `Attendu : l'image reservations:${VERSION} dans le Deployment. Constaté : ${image}.`);
      for (let i = 0; i < 6; i += 1) {
        const r = await get(`${INGRESS_URL}/version`);
        assert(r.json?.version === VERSION, `Attendu : ${VERSION} sur chaque réponse. Constaté : ${r.json?.version ?? r.status ?? r.error}. kubectl rollout status deployment/reservations ; usine release ${VERSION} a-t-il tourné ?`);
      }
    }
  },
  {
    id: 'rollout-sans-echec',
    label: 'un déploiement complet sous trafic : aucune requête en échec (le check relance le déploiement, 150 s au plus)',
    run: async () => {
      const d = await appDeployment();
      const ns = d.metadata.namespace;
      const image = d.spec.template.spec.containers[0].image;
      assert(image.endsWith(`reservations:${VERSION}`), `Attendu : la version ${VERSION} déployée avant de rejouer le déploiement. Constaté : ${image}.`);
      const run = await sousTrafic(async () => {
        await kubectl(['rollout', 'restart', '-n', ns, 'deployment/reservations']);
        return kubectl(['rollout', 'status', '-n', ns, 'deployment/reservations', '--timeout=120s'], { timeout: 130000 });
      }, { url: INGRESS_URL, apres: 3000 });
      assert(run.resultat.code === 0, `Attendu : le déploiement se termine. Constaté : ${run.resultat.stderr.trim() || run.resultat.stdout.trim()}.`);
      assert(run.echecs.length === 0, `Attendu : aucune requête en échec pendant le déploiement. Constaté : ${resume(run)}. maxUnavailable: 0 et une readinessProbe ?`);
    }
  }
];

export const hints = [
  'Pendant kubectl rollout status, que montre kubectl get pods -w ? Combien de pods prêts à chaque instant ?',
  'strategy.rollingUpdate : maxUnavailable: 0 garde trois pods prêts ; maxSurge: 1 en ajoute un le temps de la bascule ; la readinessProbe dit quand le nouveau est prêt.',
  `git tag v${VERSION} && git push origin v${VERSION} ; usine release ${VERSION} ; image: reservations:${VERSION} ; strategy: { type: RollingUpdate, rollingUpdate: { maxSurge: 1, maxUnavailable: 0 } } ; kubectl apply -f project/k8s/.`
];

export const points = 150;
