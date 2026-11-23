import { assert } from '@othila-academy/lab';
import { dockerExec, inspect, requireDocker } from '../../shared/docker.mjs';
import { run } from '../../shared/run.mjs';

const PROBE = 'timeout 3 bash -c "</dev/tcp/db/5432" 2>/dev/null';

export const title = 'Isoler la base';
export const explain = 'Dans un cloud, quel objet joue le rôle de tes réseaux front et back ?';
export const instructions = `La base ne doit être joignable que par les serveurs web. Vérifie-le toi-même :
  docker exec srv-web-1 bash -c '</dev/tcp/db/5432 && echo joignable'
  docker run --rm --network front usine-server:lab bash -c '</dev/tcp/db/5432 && echo joignable'
  docker port db
Le premier répond, le second échoue (db n'existe pas sur front), le troisième ne dit rien (aucun port publié).
Le check lance lui-même un conteneur jetable sur front, puis le supprime.

À expliquer (npx lab submit terraform isolation) : dans un cloud, quel objet joue le rôle de tes réseaux front et back ?`;

export const checks = [
  {
    id: 'db-depuis-web',
    label: 'db est joignable depuis srv-web-1 (port 5432)',
    run: async () => {
      await requireDocker();
      assert((await inspect('srv-web-1'))?.State?.Running, 'Attendu : srv-web-1 démarré. Constaté : absent. Étape serveurs.');
      const { code } = await dockerExec('srv-web-1', ['bash', '-c', PROBE]);
      assert(code === 0, 'Attendu : srv-web-1 joint db:5432. Constaté : injoignable. srv-web-1 et db partagent-ils le réseau back ?');
    }
  },
  {
    id: 'db-cachee-de-front',
    label: 'db est injoignable depuis un conteneur placé sur front seulement',
    run: async () => {
      await requireDocker();
      const net = await run('docker', ['network', 'inspect', 'front']);
      assert(net.code === 0, 'Attendu : un réseau front. Constaté : absent. Étape serveurs.');
      const { code } = await run('docker', ['run', '--rm', '--network', 'front', 'usine-server:lab', 'bash', '-c', PROBE], { timeout: 20000 });
      assert(code !== 0, 'Attendu : db injoignable depuis front. Constaté : joignable. La base est-elle aussi reliée à front ?');
    }
  },
  {
    id: 'db-sans-port',
    label: "aucun port de db n'est publié sur le poste",
    run: async () => {
      await requireDocker();
      const info = await inspect('db');
      assert(info, 'Attendu : un conteneur db. Constaté : absent. Étape serveurs.');
      const published = Object.entries(info.NetworkSettings?.Ports ?? {}).filter(([, bindings]) => bindings?.length);
      assert(published.length === 0, `Attendu : aucun port publié. Constaté : ${published.map(([p]) => p).join(', ')}. Retire le bloc ports de db.`);
    }
  }
];

export const hints = [
  'Sur quels réseaux est db, et sur lesquels sont les serveurs web ? docker inspect db --format "{{json .NetworkSettings.Networks}}".',
  'Deux conteneurs ne se joignent que s’ils partagent un réseau ; un bloc ports publie sur le poste, ce que la base ne doit pas faire.',
  'db : un seul networks_advanced { name = docker_network.back.name } et aucun bloc ports ; les serveurs web : front et back. Puis terraform apply.'
];

export const points = 100;
