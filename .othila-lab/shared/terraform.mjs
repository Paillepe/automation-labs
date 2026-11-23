// Terraform vu d'un check : on interroge l'outil sur ce qu'il a compris du code (plan), jamais le texte des fichiers.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { ROOT, run, tail } from './run.mjs';

export const INFRA = path.join(ROOT, 'project/infra');
const tf = (args, timeout = 120000) => run('terraform', [`-chdir=${INFRA}`, ...args], { timeout, env: { TF_IN_AUTOMATION: '1' } });

// terraform init (sans réseau : le provider vient du miroir de l'environnement), une fois par processus.
let initialized = false;
export async function init() {
  if (initialized) return;
  assert(existsSync(INFRA), 'Attendu : le dossier project/infra/. Constaté : absent. Il est fourni par le tag base : git status.');
  const { code, stdout, stderr } = await tf(['init', '-input=false', '-no-color']);
  assert(code === 0, `Attendu : terraform init réussit dans project/infra/. Constaté : ${tail(stderr || stdout)}`);
  initialized = true;
}

// terraform plan -detailed-exitcode : 0 rien à faire, 2 des changements, 1 une erreur.
export async function plan(extra = []) {
  await init();
  const result = await tf(['plan', '-input=false', '-no-color', '-lock=false', '-detailed-exitcode', ...extra]);
  return { ...result, summary: /Plan: [^\n]*/.exec(result.stdout)?.[0] ?? tail(result.stderr || result.stdout) };
}
