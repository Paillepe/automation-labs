// Le service HTTP : points techniques (/health, /ready, /version, /metrics), API métier, injection de pannes.

import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createFaults, freezeProcess } from './faults.js';
import { createMetrics } from './metrics.js';

export const SITES = [
  { id: 1, nom: 'Médiathèque centrale', ville: 'Valmorin' },
  { id: 2, nom: 'Les Tilleuls', ville: 'Valmorin' },
  { id: 3, nom: 'Port-Vieux', ville: 'Valmorin' },
  { id: 4, nom: 'Haut-Valmorin', ville: 'Valmorin' },
  { id: 5, nom: 'La Gare', ville: 'Saint-Aubin-sur-Morin' },
  { id: 6, nom: 'Bibliobus', ville: 'Valmorin' },
];

// Routes techniques : jamais touchées par les pannes injectées, journalisées au niveau debug.
const TECHNICAL = new Set(['/health', '/ready', '/version', '/metrics']);
const ROUTES = new Set(['/', '/health', '/ready', '/version', '/metrics', '/api/sites', '/api/config', '/api/reservations', '/fault', '/fault/freeze']);
const MAX_BODY = 10 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; version=0.0.4; charset=utf-8' : 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    ...headers,
  });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'corps de requête trop volumineux');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'corps de requête : JSON invalide');
  }
}

function sameToken(given, expected) {
  const a = Buffer.from(given ?? '');
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function createApp({ config, log, db, faults = createFaults(), now = () => new Date(), freeze = freezeProcess }) {
  const metrics = createMetrics(config);
  let shuttingDown = false;
  let lastReady = null; // dernière raison connue, pour ne journaliser que les changements d'état

  async function ready() {
    if (shuttingDown) return { ok: false, reason: 'arrêt en cours' };
    const result = await db.check();
    const key = result.ok ? 'ok' : result.reason;
    if (key !== lastReady) {
      if (result.ok) log.info('Application prête : base joignable', { event: 'ready' });
      else log.warn(`Application non prête : ${result.reason}`, { event: 'not_ready', reason: result.reason });
      lastReady = key;
    }
    return result;
  }

  function requireFaultToken(req) {
    if (!config.faultToken) throw new HttpError(404, 'injection de pannes désactivée (FAULT_TOKEN absent)');
    if (!sameToken(req.headers['x-fault-token'], config.faultToken)) throw new HttpError(403, 'jeton d\'injection invalide');
  }

  async function route(req, res, ctx) {
    const { method } = req;
    const path = ctx.path;

    if (path === '/health' && method === 'GET') return send(res, 200, { status: 'ok' });
    if (path === '/ready' && method === 'GET') {
      const r = await ready();
      return r.ok ? send(res, 200, { status: 'ready' }) : send(res, 503, { status: 'not_ready', reason: r.reason });
    }
    if (path === '/version' && method === 'GET') {
      return send(res, 200, { service: config.service, version: config.version, commit: config.commit });
    }
    if (path === '/metrics' && method === 'GET') return send(res, 200, metrics.render());

    if (path === '/fault' || path === '/fault/freeze') {
      requireFaultToken(req);
      if (path === '/fault' && method === 'GET') return send(res, 200, faults.state());
      if (path === '/fault' && method === 'DELETE') {
        log.warn('Pannes injectées retirées', { event: 'fault_cleared', request_id: ctx.id });
        return send(res, 200, faults.clear());
      }
      if (path === '/fault' && method === 'POST') {
        const body = await readJson(req);
        let state;
        try {
          state = faults.set(body);
        } catch (err) {
          throw new HttpError(400, err.message);
        }
        log.warn('Panne injectée', { event: 'fault_set', request_id: ctx.id, ...state });
        return send(res, 200, state);
      }
      if (path === '/fault/freeze' && method === 'POST') {
        const body = await readJson(req);
        const seconds = body.seconds === undefined ? Infinity : Number(body.seconds);
        if (!(seconds > 0)) throw new HttpError(400, 'seconds doit être un nombre positif');
        log.warn('Gel du processus injecté', { event: 'fault_freeze', request_id: ctx.id, seconds: Number.isFinite(seconds) ? seconds : 'infini' });
        res.once('finish', () => setImmediate(() => freeze(Number.isFinite(seconds) ? seconds * 1000 : Infinity)));
        return send(res, 202, { frozen: true, seconds: Number.isFinite(seconds) ? seconds : null });
      }
      throw new HttpError(405, 'méthode non autorisée');
    }

    // Routes métier : soumises aux pannes injectées.
    const fs = faults.state();
    if (fs.latencyMs > 0) await new Promise((r) => setTimeout(r, fs.latencyMs));
    const ref = faults.pickError();
    if (ref) {
      // La référence ne figure que dans les logs : la réponse ne donne que l'identifiant de requête.
      log.error('Erreur injectée', { event: 'fault_error', error_ref: ref, request_id: ctx.id, path });
      return send(res, 500, { error: 'erreur interne', request_id: ctx.id });
    }

    if (path === '/' && method === 'GET') {
      return send(res, 200, {
        service: config.service,
        description: 'Service de réservation des médiathèques de Valmorin',
        endpoints: ['/health', '/ready', '/version', '/metrics', '/api/sites', '/api/config', '/api/reservations'],
      });
    }
    if (path === '/api/sites' && method === 'GET') return send(res, 200, SITES);
    if (path === '/api/config' && method === 'GET') return send(res, 200, { holdDays: config.holdDays });
    if (path === '/api/reservations' && method === 'GET') {
      const { rows } = await dbCall(() =>
        db.query('select id, numero_carte, titre, site_id, creee_le, retrait_avant::text from reservation order by id desc limit 50'),
      );
      return send(res, 200, rows);
    }
    if (path === '/api/reservations' && method === 'POST') {
      const body = await readJson(req);
      const carte = String(body.numero_carte ?? '');
      const titre = String(body.titre ?? '').trim();
      const siteId = Number(body.site_id);
      if (!/^VAL\d{6}$/.test(carte)) throw new HttpError(400, 'numero_carte : « VAL » suivi de 6 chiffres');
      if (!titre || titre.length > 80) throw new HttpError(400, 'titre : 1 à 80 caractères');
      if (!SITES.some((s) => s.id === siteId)) throw new HttpError(400, 'site_id : site inconnu');
      const { rows } = await dbCall(() =>
        db.query(
          'insert into reservation (numero_carte, titre, site_id, retrait_avant) values ($1, $2, $3, $4) returning id, numero_carte, titre, site_id, creee_le, retrait_avant::text',
          [carte, titre, siteId, addDays(now(), config.holdDays)],
        ),
      );
      log.info('Réservation enregistrée', { event: 'reservation_created', request_id: ctx.id, reservation_id: rows[0].id, site_id: siteId });
      return send(res, 201, rows[0]);
    }

    if (ROUTES.has(path)) throw new HttpError(405, 'méthode non autorisée');
    throw new HttpError(404, 'ressource inconnue');
  }

  async function dbCall(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.code === 'NO_DB') throw new HttpError(503, 'aucune base configurée');
      throw Object.assign(new HttpError(503, 'base de données indisponible'), { cause: err });
    }
  }

  async function handler(req, res) {
    const started = process.hrtime.bigint();
    const given = req.headers['x-request-id'];
    const id = typeof given === 'string' && /^[\w.-]{1,64}$/.test(given) ? given : randomUUID();
    const path = new URL(req.url, 'http://localhost').pathname;
    const ctx = { id, path };
    res.setHeader('x-request-id', id);
    if (shuttingDown) res.setHeader('connection', 'close');

    res.once('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const routeLabel = ROUTES.has(path) ? path : 'other';
      metrics.observe({ method: req.method, route: routeLabel, status: res.statusCode, seconds });
      const fields = { event: 'request', request_id: id, method: req.method, path, status: res.statusCode, duration_ms: Math.round(seconds * 1000) };
      if (TECHNICAL.has(path) && res.statusCode < 500) log.debug('Requête', fields);
      else log.info('Requête', fields);
    });

    try {
      await route(req, res, ctx);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) {
        log.error(err.message, { event: 'request_error', request_id: id, path, cause: err.cause?.message ?? (err instanceof HttpError ? undefined : err.stack) });
      }
      if (!res.headersSent) send(res, status, { error: err instanceof HttpError ? err.message : 'erreur interne', request_id: id });
    }
  }

  const server = http.createServer(handler);
  server.keepAliveTimeout = 5000;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Signal ${signal} reçu : arrêt dans ${config.shutdownDelayMs} ms`, { event: 'shutdown', signal });
    await new Promise((r) => setTimeout(r, config.shutdownDelayMs));
    await new Promise((r) => server.close(r));
    await db.close();
    log.info('Arrêt terminé', { event: 'stopped' });
  }

  return { server, handler, shutdown };
}
