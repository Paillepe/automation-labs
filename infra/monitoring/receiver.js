// Récepteur de notifications local (lab monitoring) : enregistre ce qu'Alertmanager lui envoie.
//   POST /<n'importe quel chemin>  une notification (webhook d'Alertmanager), gardée en mémoire et journalisée
//   GET  /notifications            les notifications reçues, de la plus ancienne à la plus récente (200 au plus)
//   DELETE /notifications          les oublie
//   GET  /health                   vivant
// Aucune dépendance : Node.js seul.
import { createServer } from 'node:http';

const MAX = 200;
const received = [];

function log(fields) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), service: 'receiver', ...fields })}\n`);
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://receiver');
  if (req.method === 'GET' && url.pathname === '/health') return reply(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/notifications') return reply(res, 200, received);
  if (req.method === 'DELETE' && url.pathname === '/notifications') {
    received.length = 0;
    return reply(res, 200, received);
  }
  if (req.method !== 'POST') return reply(res, 404, { error: 'not found' });

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw };
    }
    const entry = { receivedAt: new Date().toISOString(), path: url.pathname, body };
    received.push(entry);
    if (received.length > MAX) received.shift();
    const alerts = Array.isArray(body.alerts) ? body.alerts : [];
    log({
      level: 'info',
      event: 'notification',
      msg: `Notification reçue : ${alerts.map((a) => `${a.labels?.alertname} (${a.status})`).join(', ') || 'sans alerte'}`,
      path: url.pathname,
      status: body.status,
      receiver: body.receiver,
      alerts: alerts.map((a) => ({ alertname: a.labels?.alertname, status: a.status })),
    });
    reply(res, 200, { ok: true });
  });
}).listen(8080, () => log({ level: 'info', event: 'started', msg: 'Récepteur de notifications prêt sur le port 8080' }));
