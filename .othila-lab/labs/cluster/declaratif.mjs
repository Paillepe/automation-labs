import { existsSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { appDeployment, kubectl } from '../../shared/kubectl.mjs';
import { ROOT, tail } from '../../shared/run.mjs';

const K8S = path.join(ROOT, 'project/k8s');

export const title = 'Rien à la main';
export const explain = "Si quelqu'un modifie le Deployment par kubectl edit, que fera le prochain usine rebuild ? Et le prochain kubectl apply ?";
export const instructions = `Tout ce qui tourne doit venir de project/k8s/. Compare le cluster et tes fichiers :
  kubectl diff -f project/k8s/ ; echo $?          0 : aucune différence
Ajoute à la main une étiquette (kubectl label deploy reservations essai=oui), relance kubectl diff, puis réapplique.
Rien ne doit exister à côté : pas de Deployment, de Service ni d'Ingress créé par kubectl create ou kubectl run.
Commite project/k8s/ et pousse.

À expliquer (npx lab submit cluster declaratif) : si quelqu'un modifie le Deployment par kubectl edit, que fera le prochain usine rebuild ? Et le prochain kubectl apply ?`;

export const checks = [
  {
    id: 'kubectl-diff-vide',
    label: "l'état du cluster correspond aux manifests de project/k8s/ (kubectl diff sans différence)",
    run: async () => {
      assert(existsSync(K8S), 'Attendu : le dossier project/k8s/. Constaté : absent.');
      await appDeployment();
      const { code, stdout, stderr } = await kubectl(['diff', '-f', K8S], { timeout: 30000 });
      assert(code !== 1, `Attendu : aucune différence. Constaté : ${tail(stdout, 4)}. kubectl apply -f project/k8s/ remet le cluster comme tes fichiers.`);
      assert(code === 0, `Attendu : kubectl diff lisible. Constaté : ${tail(stderr || stdout)}`);
    }
  },
  {
    id: 'rien-a-cote',
    label: "aucun Deployment, Service ni Ingress de l'application n'existe hors de project/k8s/",
    run: async () => {
      const ns = (await appDeployment()).metadata.namespace;
      const declared = await kubectl(['get', '-f', K8S, '-o', 'name']);
      assert(declared.code === 0, `Attendu : les objets de project/k8s/ présents dans le cluster. Constaté : ${tail(declared.stderr)}`);
      const live = await kubectl(['get', 'deployments,services,ingresses', '-n', ns, '-o', 'name']);
      const known = new Set(declared.stdout.trim().split('\n').map((n) => n.replace(/\.(apps|networking\.k8s\.io)\//, '/')));
      const extra = live.stdout.trim().split('\n').filter(Boolean).map((n) => n.replace(/\.(apps|networking\.k8s\.io)\//, '/')).filter((n) => n !== 'service/kubernetes' && !known.has(n));
      assert(extra.length === 0, `Attendu : seulement les objets de project/k8s/. Constaté : en plus, ${extra.join(', ')}. Décris-les dans un fichier, ou supprime-les (kubectl delete).`);
    }
  }
];

export const hints = [
  'Que montre kubectl diff -f project/k8s/ ? Chaque ligne en + ou en - est un écart entre le cluster et tes fichiers.',
  'kubectl apply -f project/k8s/ remet le cluster comme les fichiers ; ce qui a été créé à côté se supprime par kubectl delete.',
  'kubectl apply -f project/k8s/ ; kubectl get deploy,svc,ingress : supprime ce qui n’est pas dans tes fichiers ; kubectl diff -f project/k8s/ doit rendre 0.'
];

export const points = 75;
