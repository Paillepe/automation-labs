import { assert } from '@othila-academy/lab';
import { appDeployment, kget } from '../../shared/kubectl.mjs';
import { get, seen } from '../../shared/http.mjs';
import { INGRESS_URL } from '../../shared/kubectl.mjs';

export const title = 'Le mot de passe dans un Secret';
export const explain = 'base64 n’est pas du chiffrement. Que gagne-t-on quand même à sortir le mot de passe dans un Secret ?';
export const instructions = `Le mot de passe de la base est en clair dans ton Deployment. Range-le dans un Secret :
  - project/k8s/db-secret.yaml : un Secret reservations-db (type Opaque), clé password (stringData) ;
  - dans le Deployment : DB_PASSWORD prend sa valeur dans ce Secret (valueFrom.secretKeyRef).
  kubectl apply -f project/k8s/
  kubectl get secret reservations-db -o jsonpath='{.data.password}' | base64 -d
La dernière commande montre ce que vaut un Secret : encodé, pas chiffré. C'est un identifiant de LAB, commité ici
pour que usine rebuild le recrée ; dans une vraie équipe, il ne se commite pas en clair (Sealed Secrets, SOPS).

À expliquer (npx lab submit resilience secret) : base64 n'est pas du chiffrement. Que gagne-t-on quand même à sortir le mot de passe dans un Secret ?`;

export const checks = [
  {
    id: 'mot-de-passe-hors-deployment',
    label: "le mot de passe de la base n'apparaît plus en clair dans le Deployment",
    run: async () => {
      const c = (await appDeployment()).spec.template.spec.containers[0];
      const plain = (c.env ?? []).filter((e) => e.name === 'DB_PASSWORD' && e.value !== undefined);
      assert(plain.length === 0, 'Attendu : DB_PASSWORD lu dans un Secret (valueFrom.secretKeyRef). Constaté : une valeur en clair (value:).');
      const fromSecret = (c.env ?? []).some((e) => e.name === 'DB_PASSWORD' && e.valueFrom?.secretKeyRef) || (c.envFrom ?? []).some((e) => e.secretRef);
      assert(fromSecret, 'Attendu : DB_PASSWORD issu d’un Secret. Constaté : aucune référence à un Secret.');
    }
  },
  {
    id: 'ready-apres-secret',
    label: "le Secret cité par le Deployment existe, et par l'Ingress /ready est toujours vert",
    run: async () => {
      const d = await appDeployment();
      const c = d.spec.template.spec.containers[0];
      const name = (c.env ?? []).find((e) => e.name === 'DB_PASSWORD')?.valueFrom?.secretKeyRef?.name ?? (c.envFrom ?? []).find((e) => e.secretRef)?.secretRef?.name;
      assert(name, 'Attendu : DB_PASSWORD issu d’un Secret. Constaté : aucune référence à un Secret.');
      assert(await kget(['secret', '-n', d.metadata.namespace, name]), `Attendu : le Secret ${name} dans ${d.metadata.namespace}. Constaté : absent. kubectl apply -f project/k8s/.`);
      const r = await get(`${INGRESS_URL}/ready`);
      assert(r.status === 200, `Attendu : /ready en HTTP 200. Constaté : ${seen(r)}${r.json?.reason ? ` (${r.json.reason})` : ''}. Le Secret existe-t-il, avec la bonne clé ?`);
    }
  }
];

export const hints = [
  'kubectl get deploy reservations -o yaml : où apparaît encore le mot de passe ?',
  'Un objet Secret, puis dans le conteneur : env: - name: DB_PASSWORD, valueFrom: secretKeyRef: { name: …, key: … }.',
  'db-secret.yaml : kind: Secret, metadata.name: reservations-db, stringData: { password: lab-cluster-password } ; Deployment : valueFrom: { secretKeyRef: { name: reservations-db, key: password } }.'
];

export const points = 75;
