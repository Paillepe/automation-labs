// GitHub Actions vu d'un check (session seulement : au rejeu, ces checks sont neutralisés ou joués par act).
import { assert } from '@othila-academy/lab';
import { ghApi, requireOrigin } from './distant.mjs';
import { headSha } from './run.mjs';

export const WORKFLOW = '.github/workflows/ci.yml';

// Les exécutions du workflow ci.yml sur le fork, les plus récentes d'abord (filtrées par commit si sha est donné).
export async function runs({ sha, status } = {}) {
  const repo = await requireOrigin();
  const query = new URLSearchParams({ per_page: '50', ...(sha ? { head_sha: sha } : {}), ...(status ? { status } : {}) });
  try {
    const data = await ghApi(`/repos/${repo}/actions/workflows/ci.yml/runs?${query}`);
    return { repo, runs: data?.workflow_runs ?? [] };
  } catch (error) {
    if (error.status === 404) throw new Error(`Attendu : un workflow ${WORKFLOW} connu de GitHub sur ${repo}. Constaté : aucun. As-tu poussé ta branche (git push) ?`);
    throw error;
  }
}

// La dernière exécution terminée du workflow sur le commit courant.
export async function lastRunOnHead() {
  const sha = await headSha();
  const { repo, runs: list } = await runs({ sha });
  assert(list.length > 0, `Attendu : une exécution de ci.yml sur ton commit ${sha.slice(0, 12)}. Constaté : aucune. As-tu poussé ce commit (git push) ? Actions est-il activé sur ${repo} ?`);
  const done = list.find((run) => run.status === 'completed');
  assert(done, `Attendu : une exécution terminée sur ${sha.slice(0, 12)}. Constaté : ${list[0].status}. Attends la fin (gh run watch), puis relance le check.`);
  return { repo, run: done };
}

// Les artefacts d'une exécution.
export async function artifacts(repo, runId) {
  const data = await ghApi(`/repos/${repo}/actions/runs/${runId}/artifacts`);
  return data?.artifacts ?? [];
}
