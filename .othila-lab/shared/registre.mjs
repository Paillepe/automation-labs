// Le registre de l'étudiant (GHCR), vu d'un check de session : l'image ghcr.io/<propriétaire>/<dépôt>:<étiquette>
// existe-t-elle, et quel est son condensat ? Interrogé par l'API du registre, avec un jeton anonyme (paquet public).
import { requireOrigin } from './distant.mjs';

export async function imageName() {
  return `ghcr.io/${(await requireOrigin()).toLowerCase()}`;
}

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json'
].join(', ');

// Le condensat de l'image à cette étiquette, ou null si elle n'existe pas. Lève si le paquet est privé.
export async function registryDigest(tag) {
  const image = await imageName();
  const name = image.replace(/^ghcr\.io\//, '');
  const auth = await fetch(`https://ghcr.io/token?service=ghcr.io&scope=repository:${name}:pull`, { signal: AbortSignal.timeout(10000) });
  const { token } = auth.ok ? await auth.json() : {};
  const response = await fetch(`https://ghcr.io/v2/${name}/manifests/${tag}`, {
    method: 'HEAD',
    headers: { Accept: ACCEPT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10000)
  });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Attendu : ${image} lisible. Constaté : accès refusé (paquet privé, ou jamais publié). Sur GitHub : ton profil > Packages > ${name.split('/')[1]} > Package settings > Change visibility > Public.`
    );
  }
  if (!response.ok) throw new Error(`Attendu : une réponse du registre. Constaté : HTTP ${response.status} pour ${image}:${tag}.`);
  return response.headers.get('docker-content-digest');
}
