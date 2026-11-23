// SSH vers les serveurs du cours, avec la clé de lab installée par usine (~/.ssh/usine_lab).
import { homedir } from 'node:os';
import path from 'node:path';
import { run } from './run.mjs';

export const KEY = path.join(homedir(), '.ssh', 'usine_lab');
const OPTIONS = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'LogLevel=ERROR', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3'];

export const ssh = (host, command, { user = 'deploy', timeout = 8000 } = {}) =>
  run('ssh', ['-i', KEY, ...OPTIONS, `${user}@${host}`, command], { timeout });
