// Le rejeu du workflow de l'étudiant par act (ADR-0006) : rejeu formateur et CI seulement, jamais chez les étudiants.
// Le résultat est mémorisé pour la durée du processus : les checks d'une même étape ne relancent pas act.
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, run, tail } from './run.mjs';

export const RUNNER_IMAGE = process.env.USINE_ACT_IMAGE ?? 'catthehacker/ubuntu:act-24.04';
// act 0.2.98 refuse les envois d'upload-artifact v6 (« Error unauthorized ») : au rejeu, v6 est jouée par une copie de
// v4 (même entrées, même artefact), préparée par tests/replay.sh. Rien ne change dans le workflow de l'étudiant.
const UPLOAD_V4 = path.join(homedir(), '.cache/usine/upload-artifact-v4');
let memo = null;

// L'identifiant du conteneur courant (le devcontainer), lu comme le fait usine (_lib.sh, self_container).
function selfContainer() {
  try {
    return /containers\/([0-9a-f]{64})/.exec(readFileSync('/proc/self/mountinfo', 'utf8'))?.[1] ?? null;
  } catch {
    return null;
  }
}

async function selfAddress() {
  const id = selfContainer();
  if (!id) return null;
  const { stdout } = await run('docker', ['inspect', id, '--format', '{{(index .NetworkSettings.Networks "usine").IPAddress}}']);
  return stdout.trim() || null;
}

// Joue l'évènement push du workflow ci.yml ; { code, artifacts: [noms], summary }.
export async function actPush() {
  if (memo) return memo;
  const dir = mkdtempSync(path.join(tmpdir(), 'usine-act-'));
  const address = await selfAddress();
  const args = ['push', '--rm', '-W', '.github/workflows/ci.yml', '-P', `ubuntu-24.04=${RUNNER_IMAGE}`, '-P', `ubuntu-latest=${RUNNER_IMAGE}`,
    '--network', 'usine', '--artifact-server-path', dir, ...(address ? ['--artifact-server-addr', address] : []),
    ...(existsSync(UPLOAD_V4) ? ['--local-repository', `actions/upload-artifact@v6=${UPLOAD_V4}`] : [])];
  const result = await run('act', args, { cwd: ROOT, timeout: 600000 });
  const found = [];
  const walk = (d) => {
    for (const e of existsSync(d) ? readdirSync(d, { withFileTypes: true }) : []) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else found.push(e.name);
    }
  };
  walk(dir);
  memo = { code: result.code, artifacts: found, summary: result.timedOut ? 'act toujours en cours après 600 s' : `code ${result.code} — ${tail(result.stdout + result.stderr, 3)}` };
  return memo;
}
