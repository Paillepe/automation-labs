// Du trafic pendant une action (suppression d'un pod, mise à jour) : des requêtes en continu par l'Ingress,
// pour compter celles qui échouent. Pas une mesure de performance : on compte des échecs, pas des durées.
import { pause } from './attendre.mjs';

export async function sousTrafic(action, { url, apres = 8000, pas = 50, path = '/version' }) {
  const echecs = [];
  const versions = new Map();
  let total = 0;
  let running = true;
  const loop = (async () => {
    while (running) {
      total += 1;
      try {
        const r = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(3000) });
        const body = await r.text();
        if (r.status !== 200) echecs.push(`HTTP ${r.status}`);
        else {
          const v = JSON.parse(body).version;
          versions.set(v, (versions.get(v) ?? 0) + 1);
        }
      } catch (error) {
        echecs.push(error?.cause?.code ?? error?.name ?? 'erreur');
      }
      await pause(pas);
    }
  })();
  await pause(1000);
  let resultat;
  try {
    resultat = await action();
  } finally {
    await pause(apres);
    running = false;
    await loop;
  }
  return { total, echecs, versions, resultat };
}

export const resume = ({ total, echecs }) => {
  const kinds = [...new Set(echecs)].slice(0, 3).join(', ');
  return `${echecs.length} requête(s) en échec sur ${total}${kinds ? ` (${kinds})` : ''}`;
};
