// Docker vu d'un check : un seul message quand le démon ne répond pas, le même pour tous les checks.
import { assert } from '@othila-academy/lab';
import { run } from './run.mjs';

export const DOCKER_DOWN =
  'Docker ne répond pas : lance Docker Desktop (ou le service docker), puis relance le check. usine doctor dit ce qui manque.';

export async function dockerOk() {
  const { code } = await run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 8000 });
  return code === 0;
}

export async function requireDocker() {
  assert(await dockerOk(), DOCKER_DOWN);
}

// docker inspect d'un conteneur, ou null s'il n'existe pas.
export async function inspect(name) {
  const { code, stdout } = await run('docker', ['container', 'inspect', name]);
  if (code !== 0) return null;
  return JSON.parse(stdout)[0];
}

export async function running(name) {
  const info = await inspect(name);
  return Boolean(info?.State?.Running);
}

// Exécute une commande dans un conteneur.
export const dockerExec = (name, args, options = {}) => run('docker', ['exec', name, ...args], { timeout: 10000, ...options });
