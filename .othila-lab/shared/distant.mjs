// Les checks distants (ADR-0004) : GitHub Actions et GHCR. Neutralisés au rejeu (USINE_REPLAY=1), et dégradés
// proprement hors ligne : un seul message clair, jamais une trace obscure.
import { REPLAY, run } from './run.mjs';

export const HORS_LIGNE = 'GitHub est injoignable : ce check a besoin du réseau. Vérifie ta connexion, puis relance le check.';
export const GH_ABSENT = "gh n'est pas connecté à GitHub : lance gh auth login (lab demarrage), puis relance le check.";
const OFFLINE = /could not resolve|connection refused|network is unreachable|timeout|i\/o timeout|no such host|EAI_AGAIN|ENOTFOUND|ETIMEDOUT/i;

export const distant = ({ id, label, run: check }) => ({
  id,
  label: `${label} (GitHub, non rejoué en CI)`,
  passesOnStart: REPLAY,
  run: async (ctx) => {
    if (REPLAY) return; // rejeu : compté comme non rejoué
    try {
      await check(ctx);
    } catch (error) {
      throw OFFLINE.test(error.message) ? new Error(HORS_LIGNE) : error;
    }
  }
});

// Un check qui se joue en local au rejeu et sur GitHub en séance (ADR-0006 : act au rejeu seulement).
export const localOuDistant = ({ id, label, replay, session }) => ({
  id,
  label,
  run: async (ctx) => {
    if (REPLAY) return replay(ctx);
    try {
      await session(ctx);
    } catch (error) {
      throw OFFLINE.test(error.message) ? new Error(HORS_LIGNE) : error;
    }
  }
});

// gh api <chemin>, décodé. Lève un message clair si gh n'est pas connecté ou si GitHub ne répond pas.
export async function ghApi(pathname, { timeout = 15000 } = {}) {
  const { code, stdout, stderr } = await run('gh', ['api', '-H', 'Accept: application/vnd.github+json', pathname], { timeout });
  if (code === 0) return JSON.parse(stdout || 'null');
  if (OFFLINE.test(stderr)) throw new Error(HORS_LIGNE);
  if (/auth login|not logged|authentication/i.test(stderr)) throw new Error(GH_ABSENT);
  const error = new Error(stderr.trim() || `gh api ${pathname} : code ${code}`);
  error.status = Number(/HTTP (\d{3})/.exec(stderr)?.[1] ?? 0);
  throw error;
}

// propriétaire/dépôt du fork, d'après le dépôt distant origin ; null s'il ne pointe pas vers GitHub.
export async function originRepo() {
  const { code, stdout } = await run('git', ['remote', 'get-url', 'origin']);
  if (code !== 0) return null;
  const match = /github\.com[:/]+([^/]+)\/([^/]+?)(\.git)?\/?$/.exec(stdout.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function requireOrigin() {
  const repo = await originRepo();
  if (!repo) throw new Error("Attendu : un dépôt distant origin qui pointe vers ton fork sur GitHub. Constaté : aucun. Lab demarrage : gh repo fork --remote.");
  return repo;
}

// Un check sur le poste de l'étudiant (dépôts distants, compte GitHub) : le rejeu n'a pas de poste, il le saute.
export const poste = ({ id, label, run: check }) => ({
  id,
  label: `${label} (poste, non rejoué en CI)`,
  passesOnStart: REPLAY,
  run: async (ctx) => {
    if (REPLAY) return;
    await check(ctx);
  }
});
