// Ansible vu d'un check : depuis project/ansible/, avec son ansible.cfg désigné par ANSIBLE_CONFIG (un dossier
// ouvert en écriture à tous ferait ignorer le fichier). On interroge l'outil, jamais le texte des fichiers.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { ROOT, run, tail } from './run.mjs';

export const ANSIBLE = path.join(ROOT, 'project/ansible');
const env = () => ({ ANSIBLE_CONFIG: path.join(ANSIBLE, 'ansible.cfg'), ANSIBLE_NOCOLOR: '1', ANSIBLE_FORCE_COLOR: '0' });

export const ansible = (cmd, args, timeout = 60000) => run(cmd, args, { cwd: ANSIBLE, env: env(), timeout });

export function requireFile(relative) {
  assert(existsSync(path.join(ANSIBLE, relative)), `Attendu : project/ansible/${relative}. Constaté : absent.`);
}

// Les hôtes d'un groupe de l'inventaire, tels qu'Ansible les comprend.
export async function groupHosts(group) {
  requireFile('inventory.ini');
  const { code, stdout, stderr } = await ansible('ansible-inventory', ['--list']);
  assert(code === 0, `Attendu : un inventaire lisible. Constaté : ${tail(stderr || stdout)}`);
  return JSON.parse(stdout)[group]?.hosts ?? [];
}

// Lance le playbook de l'étudiant (exception admise : SPEC §6.2) ; renvoie le récapitulatif par hôte.
export async function playbook() {
  requireFile('site.yml');
  const result = await ansible('ansible-playbook', ['site.yml'], 240000);
  const recap = {};
  for (const m of result.stdout.matchAll(/^(\S+)\s+:\s+ok=(\d+)\s+changed=(\d+)\s+unreachable=(\d+)\s+failed=(\d+)/gm)) {
    recap[m[1]] = { ok: +m[2], changed: +m[3], unreachable: +m[4], failed: +m[5] };
  }
  return { ...result, recap, summary: result.timedOut ? 'toujours en cours après 240 s' : tail(result.stdout || result.stderr, 3) };
}
