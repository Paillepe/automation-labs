// Point d'entrée : lit la configuration, démarre le service HTTP, s'arrête proprement sur SIGTERM et SIGINT.

import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db.js';
import { createLogger } from './log.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  const log = createLogger();
  if (err instanceof ConfigError) {
    log.fatal(err.message, { event: 'config_error', setting: err.setting });
  } else {
    log.fatal(`Démarrage impossible : ${err.message}`, { event: 'config_error' });
  }
  process.exit(1);
}

const log = createLogger({ level: config.logLevel, service: config.service });

// Réserve de mémoire, occupée réellement (remplie) pour peser dans la mémoire résidente du processus.
const ballast = config.ballastMb > 0 ? Buffer.alloc(config.ballastMb * 1024 * 1024, 1) : null;

const db = createDb(config.db);
const { server, shutdown } = createApp({ config, log, db });

server.listen(config.port, () => {
  log.info('Démarrage du service de réservation', {
    event: 'started',
    version: config.version,
    commit: config.commit,
    port: server.address().port,
    database: config.db ? `${config.db.host}:${config.db.port}/${config.db.database}` : null,
    hold_days: config.holdDays,
    ballast_mb: ballast ? config.ballastMb : 0,
    fault_injection: Boolean(config.faultToken),
  });
  if (!config.db) log.warn('Aucune base configurée (DB_HOST absent) : /ready répondra 503', { event: 'no_database' });
});

server.on('error', (err) => {
  log.fatal(`Écoute impossible sur le port ${config.port} : ${err.message}`, { event: 'listen_error' });
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    // Filet de sécurité : si l'arrêt propre traîne, on sort quand même.
    setTimeout(() => process.exit(1), config.shutdownDelayMs + 10000).unref();
    shutdown(signal).then(() => process.exit(0));
  });
}
