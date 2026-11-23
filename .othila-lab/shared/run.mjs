// Lancer une commande depuis un check : jamais d'exception sur un code de sortie non nul, toujours un délai maximal.
// Le résultat dit ce qui s'est passé ({ code, stdout, stderr, timedOut }) ; au check de le traduire en attendu / constaté.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// La racine du dépôt (ou du clone de rejeu) : ce module est dans .othila-lab/shared/.
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const REPLAY = process.env.USINE_REPLAY === '1';

export function run(cmd, args = [], { timeout = 5000, cwd = ROOT, env = {}, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { cwd, timeout, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : error.code === 'ENOENT' ? 127 : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr), timedOut: Boolean(error?.killed) });
      }
    );
    if (input !== undefined) child.stdin.end(input);
  });
}

// La fin d'une sortie, pour un message d'échec lisible (les messages sont tronqués à 1000 caractères).
export const tail = (text, lines = 4) => String(text).trim().split('\n').slice(-lines).join(' ⏎ ').slice(0, 400);

// Le SHA complet du commit courant du dépôt.
export async function headSha() {
  const { stdout } = await run('git', ['rev-parse', 'HEAD']);
  return stdout.trim();
}
