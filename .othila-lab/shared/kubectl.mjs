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
