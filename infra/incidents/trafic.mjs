// Générateur de trafic de l'incident « erreurs » (lab monitoring), lancé en Job dans le cluster.
// Interroge l'application pendant DURATION secondes, puis retire les pannes des pods (panne passagère).
// Variables : TARGET (adresse du Service, sinon les pods un par un), PODS (adresses des pods, séparées par des
// virgules), TOKEN (jeton des pannes), DURATION (s), INTERVAL_MS.
const { TARGET = '', PODS = '', TOKEN = '', DURATION = '300', INTERVAL_MS = '200' } = process.env;
const pods = PODS.split(',').filter(Boolean);
const bases = TARGET ? [TARGET] : pods.map((ip) => `http://${ip}:8080`);
const paths = ['/api/sites', '/api/reservations', '/api/config', '/'];
const end = Date.now() + Number(DURATION) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (fields) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), service: 'trafic', ...fields })}\n`);

let sent = 0;
let errors = 0;
log({ level: 'info', event: 'start', msg: `Trafic pendant ${DURATION} s vers ${bases.join(', ')}` });
while (Date.now() < end) {
  const url = `${bases[sent % bases.length]}${paths[sent % paths.length]}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    await r.arrayBuffer();
    if (r.status >= 500) errors++;
  } catch {
    errors++;
  }
  sent++;
  if (sent % 300 === 0) log({ level: 'info', event: 'progress', sent, errors });
  await sleep(Number(INTERVAL_MS));
}
for (const ip of pods) {
  await fetch(`http://${ip}:8080/fault`, { method: 'DELETE', headers: { 'x-fault-token': TOKEN }, signal: AbortSignal.timeout(3000) }).catch(() => {});
}
log({ level: 'info', event: 'end', msg: 'Pannes retirées : fin de l’incident', sent, errors });
