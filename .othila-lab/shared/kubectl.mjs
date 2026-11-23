// kubectl vu d'un check : délai borné, sortie JSON décodée, un message unique quand le cluster ne répond pas.
import { run } from './run.mjs';

export const CLUSTER_DOWN =
  "le cluster ne répond pas : lance usine up cluster (ou usine rebuild), puis relance le check. kubectl get nodes doit répondre.";

export const kubectl = (args, options = {}) => run('kubectl', ['--request-timeout=5s', ...args], { timeout: 10000, ...options });

// kubectl get … -o json, décodé ; null si l'objet n'existe pas.
export async function kget(args) {
  const { code, stdout } = await kubectl(['get', ...args, '-o', 'json']);
  if (code !== 0) return null;
  return JSON.parse(stdout);
}

export async function clusterOk() {
  const { code } = await kubectl(['get', '--raw', '/readyz']);
  return code === 0;
}

// L'application de l'étudiant dans le cluster : le Deployment « reservations », dans l'espace de noms de son choix.
import { assert } from '@othila-academy/lab';
export const APP = 'reservations';
export const INGRESS_URL = process.env.USINE_INGRESS_URL ?? 'http://k3d-usine-serverlb';

export async function requireCluster() {
  assert(await clusterOk(), CLUSTER_DOWN);
}

// Le Deployment reservations (le premier trouvé), ou un échec qui dit quoi faire.
export async function appDeployment() {
  await requireCluster();
  const list = await kget(['deployments', '-A', '--field-selector', `metadata.name=${APP}`]);
  const deployment = list?.items?.[0];
  assert(deployment, `Attendu : un Deployment ${APP}. Constaté : aucun. kubectl apply -f project/k8s/.`);
  return deployment;
}

// Exécute une requête HTTP depuis un pod de l'application (son image a Node.js) : { status, body } ou { error }.
export async function fromAppPod(namespace, url) {
  const script = `fetch(${JSON.stringify(url)},{signal:AbortSignal.timeout(3000)}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(e=>console.log(JSON.stringify({error:String(e.cause?.code??e.message)})))`;
  const { code, stdout, stderr } = await kubectl(['exec', '-n', namespace, `deploy/${APP}`, '--', 'node', '-e', script], { timeout: 20000 });
  if (code !== 0) return { error: stderr.trim().split('\n').pop() || `kubectl exec : code ${code}` };
  try {
    return JSON.parse(stdout.trim().split('\n').pop());
  } catch {
    return { error: stdout.trim() };
  }
}

// Pourquoi les pods de l'application ne sont pas prêts, en une phrase (image absente, crash, sonde…).
export async function podTrouble(namespace) {
  const pods = await kget(['pods', '-n', namespace, '-l', `app.kubernetes.io/name=${APP}`]);
  const states = (pods?.items ?? []).flatMap((p) => (p.status?.containerStatuses ?? []).map((c) => c.state?.waiting?.reason ?? (c.ready ? 'prêt' : c.state?.running ? 'démarré, pas prêt' : 'arrêté')));
  if (states.includes('ErrImageNeverPull') || states.includes('ErrImagePull') || states.includes('ImagePullBackOff'))
    return "image introuvable dans le cluster : lance usine release <version>, puis kubectl rollout restart deployment/reservations";
  if (states.includes('CrashLoopBackOff')) return `l'application s'arrête en boucle : kubectl logs -n ${namespace} deploy/${APP}`;
  return states.length ? `pods : ${states.join(', ')}` : `aucun pod portant le label app.kubernetes.io/name=${APP}`;
}
