import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/log.js';

// Base simulée : l'état de la connexion se règle depuis le test.
function fakeDb() {
  const rows = [];
  const db = {
    up: false,
    configured: true,
    async check() {
      return db.up ? { ok: true } : { ok: false, reason: 'base injoignable : ECONNREFUSED' };
    },
    async query(text, params) {
      if (!db.up) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      if (text.startsWith('insert')) {
        const row = { id: rows.length + 1, numero_carte: params[0], titre: params[1], site_id: params[2], retrait_avant: params[3] };
        rows.push(row);
        return { rows: [row] };
      }
      return { rows: [...rows].reverse() };
    },
    async close() {},
  };
  return db;
}

const lines = [];
const db = fakeDb();
let base;
let app;
const frozen = [];

before(async () => {
  const config = loadConfig({ APP_VERSION: '1.4.0', APP_COMMIT: 'deadbeef', FAULT_TOKEN: 'jeton-de-lab', SHUTDOWN_DELAY_MS: '0', LOG_LEVEL: 'debug' });
  const log = createLogger({ level: 'debug', write: (l) => lines.push(JSON.parse(l)) });
  app = createApp({ config, log, db, now: () => new Date('2026-10-15T10:00:00Z'), freeze: (ms) => frozen.push(ms) });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await app.shutdown('test');
});

const fault = (method, path, body) =>
  fetch(`${base}${path}`, { method, headers: { 'x-fault-token': 'jeton-de-lab', 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

test('/health répond 200 même sans base', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('/ready répond 503 sans base, avec la raison', async () => {
  db.up = false;
  const res = await fetch(`${base}/ready`);
  assert.equal(res.status, 503);
  assert.match((await res.json()).reason, /ECONNREFUSED/);
  assert.ok(lines.some((l) => l.event === 'not_ready'));
});

test('/version renvoie la version et le commit', async () => {
  const res = await fetch(`${base}/version`);
  assert.deepEqual(await res.json(), { service: 'reservations', version: '1.4.0', commit: 'deadbeef' });
});

test('identifiant de requête : repris s\'il est fourni, journalisé en JSON', async () => {
  const res = await fetch(`${base}/api/sites`, { headers: { 'x-request-id': 'essai-42' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-request-id'), 'essai-42');
  assert.equal((await res.json()).length, 6);
  const entry = lines.find((l) => l.event === 'request' && l.request_id === 'essai-42');
  assert.equal(entry.status, 200);
  assert.equal(entry.level, 'info');
  assert.ok(entry.time && entry.service === 'reservations');
});

test('réservation : 503 sans base, 201 avec la base', async () => {
  const body = JSON.stringify({ numero_carte: 'VAL000123', titre: 'Le Petit Prince', site_id: 3 });
  const headers = { 'content-type': 'application/json' };
  db.up = false;
  assert.equal((await fetch(`${base}/api/reservations`, { method: 'POST', headers, body })).status, 503);
  db.up = true;
  const res = await fetch(`${base}/api/reservations`, { method: 'POST', headers, body });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).retrait_avant, '2026-10-22');
  assert.equal((await fetch(`${base}/ready`)).status, 200);
  const list = await (await fetch(`${base}/api/reservations`)).json();
  assert.equal(list.length, 1);
});

test('réservation invalide : 400', async () => {
  const res = await fetch(`${base}/api/reservations`, { method: 'POST', body: JSON.stringify({ numero_carte: 'X', titre: 'a', site_id: 1 }) });
  assert.equal(res.status, 400);
});

test('/metrics expose le compteur de requêtes par statut', async () => {
  const text = await (await fetch(`${base}/metrics`)).text();
  assert.match(text, /http_requests_total\{method="GET",route="\/api\/sites",status="200"\} \d+/);
  assert.match(text, /http_request_duration_seconds_bucket/);
});

test('injection de pannes : jeton exigé', async () => {
  const res = await fetch(`${base}/fault`, { method: 'POST', body: '{"errorRate":1}' });
  assert.equal(res.status, 403);
});

test('erreur injectée : 500, référence unique dans les logs seulement', async () => {
  assert.equal((await fault('POST', '/fault', { errorRate: 1 })).status, 200);
  const res = await fetch(`${base}/api/sites`);
  assert.equal(res.status, 500);
  const text = await res.text();
  const entry = lines.findLast((l) => l.event === 'fault_error');
  assert.match(entry.error_ref, /^ERR-[0-9A-F]{8}$/);
  assert.ok(!text.includes(entry.error_ref), 'la référence ne doit pas figurer dans la réponse');
  // Les routes techniques ne sont pas touchées.
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fault('DELETE', '/fault')).status, 200);
  assert.equal((await fetch(`${base}/api/sites`)).status, 200);
});

test('gel du processus : demandé après la réponse', async () => {
  const res = await fault('POST', '/fault/freeze', { seconds: 2 });
  assert.equal(res.status, 203);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(frozen, [2000]);
});

test('route inconnue : 404', async () => {
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});
