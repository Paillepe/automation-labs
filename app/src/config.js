// Lecture de la configuration : tout vient des variables d'environnement, posées par celui qui déploie
// (script, rôle Ansible, image, manifest Kubernetes). Aucune valeur n'est lue ailleurs.

export class ConfigError extends Error {
  constructor(message, setting) {
    super(message);
    this.name = 'ConfigError';
    this.setting = setting;
  }
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

function integer(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`Réglage invalide : ${name}=${raw} (attendu : un entier entre ${min} et ${max}).`, name);
  }
  return value;
}

// Liste de noms séparés par des virgules ou des espaces.
function names(raw) {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  // Réglages rendus obligatoires par la version déployée : l'application refuse de démarrer s'il en manque un.
  for (const name of names(env.APP_REQUIRED_ENV)) {
    if (env[name] === undefined || env[name] === '') {
      throw new ConfigError(
        `Réglage obligatoire absent : ${name}. Cette version de l'application ne démarre pas sans lui.`,
        name,
      );
    }
  }

  const logLevel = (env.LOG_LEVEL || 'info').toLowerCase();
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new ConfigError(`Réglage invalide : LOG_LEVEL=${env.LOG_LEVEL} (attendu : ${LOG_LEVELS.join(', ')}).`, 'LOG_LEVEL');
  }

  return {
    service: 'reservations',
    version: env.APP_VERSION || '0.0.0-dev',
    commit: env.APP_COMMIT || 'unknown',
    port: integer(env, 'PORT', 8080, 0, 65535),
    logLevel,
    // Durée pendant laquelle un ouvrage réservé est mis de côté, en jours.
    holdDays: integer(env, 'RESERVATION_HOLD_DAYS', 7, 1, 60),
    // À l'arrêt : délai pendant lequel /ready répond 503 avant la fermeture, le temps que le trafic s'écarte.
    shutdownDelayMs: integer(env, 'SHUTDOWN_DELAY_MS', 2000, 0, 60000),
    // Mémoire réservée au démarrage, en Mio (0 : aucune).
    ballastMb: integer(env, 'APP_BALLAST_MB', 0, 0, 4096),
    faultToken: env.FAULT_TOKEN || '',
    db: env.DB_HOST
      ? {
          host: env.DB_HOST,
          port: integer(env, 'DB_PORT', 5432, 1, 65535),
          database: env.DB_NAME || 'reservations',
          user: env.DB_USER || 'reservations',
          password: env.DB_PASSWORD || '',
        }
      : null,
  };
}
