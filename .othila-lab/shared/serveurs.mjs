// Les serveurs du cours vus d'un check : ce que répond l'application, et le script de déploiement de l'étudiant.
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { get, seen } from './http.mjs';
import { ROOT, headSha, run, tail } from './run.mjs';
import { requireDocker, running } from './docker.mjs';

export const DEPLOY = 'project/deploy/deploy.sh';

// Le serveur tourne-t-il ? Un seul message, le même pour tous les checks, quand il est arrêté.
export async function requireServer(name, remedy = 'usine up servers (ou usine rebuild)') {
  await requireDocker();
  assert(await running(name), `${name} n'est pas démarré : lance ${remedy}, puis relance le check.`);
}

// /version de l'application sur un serveur : { commit, version }, ou un échec qui dit ce qui a répondu.
export async function version(host, port = 8080) {
  const r = await get(`http://${host}:${port}/version`);
  assert(r.ok && r.json?.commit, `Attendu : ${host} répond sur /version. Constaté : ${seen(r)}. L'application est-elle déployée et démarrée ?`);
  return r.json;
}

export async function health(host, port = 8080) {
  const r = await get(`http://${host}:${port}/health`);
  assert(r.status === 200, `Attendu : /health de ${host} en HTTP 200. Constaté : ${seen(r)}. Sur le serveur : sudo service reservations status, et /var/log/reservations/reservations.log.`);
}

// Le SHA servi est-il celui du commit courant ?
export async function servesHead(host, port = 8080) {
  const [served, sha] = [await version(host, port), await headSha()];
  assert(
    served.commit === sha,
    `Attendu : /version de ${host} annonce le commit courant ${sha.slice(0, 12)}. Constaté : ${String(served.commit).slice(0, 12)}. As-tu redéployé après ton dernier commit ?`
  );
}

export function requireDeployScript() {
  const file = path.join(ROOT, DEPLOY);
  assert(existsSync(file), `Attendu : ${DEPLOY}. Constaté : absent.`);
  assert(statSync(file).mode & 0o111, `Attendu : ${DEPLOY} exécutable. Constaté : non exécutable. chmod +x ${DEPLOY}, puis commite.`);
}

// Lance le script de l'étudiant (exception admise : SPEC §6.2), 150 s au plus.
export async function deploy(ref) {
  requireDeployScript();
  const result = await run(path.join(ROOT, DEPLOY), [ref], { timeout: 150000 });
  return { ...result, summary: result.timedOut ? 'toujours en cours après 150 s' : `code ${result.code} — ${tail(result.stderr || result.stdout)}` };
}
