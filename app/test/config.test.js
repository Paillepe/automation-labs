import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig } from '../src/config.js';

test('valeurs par défaut sans aucune variable', () => {
  const c = loadConfig({});
  assert.equal(c.version, '0.0.0-dev');
  assert.equal(c.commit, 'unknown');
  assert.equal(c.port, 8080);
  assert.equal(c.holdDays, 7);
  assert.equal(c.db, null);
});

test('version et commit lus dans APP_VERSION et APP_COMMIT', () => {
  const c = loadConfig({ APP_VERSION: '1.2.3', APP_COMMIT: 'abc123' });
  assert.equal(c.version, '1.2.3');
  assert.equal(c.commit, 'abc123');
});

test('la base est configurée par DB_HOST', () => {
  const c = loadConfig({ DB_HOST: 'db', DB_PASSWORD: 's3cret' });
  assert.deepEqual(c.db, { host: 'db', port: 5432, database: 'reservations', user: 'reservations', password: 's3cret' });
});

test('un réglage rendu obligatoire et absent empêche le démarrage', () => {
  assert.throws(
    () => loadConfig({ APP_REQUIRED_ENV: 'RESERVATION_HOLD_DAYS' }),
    (err) => err instanceof ConfigError && err.setting === 'RESERVATION_HOLD_DAYS' && /obligatoire absent/.test(err.message),
  );
});

test('un réglage rendu obligatoire et présent laisse démarrer', () => {
  const c = loadConfig({ APP_REQUIRED_ENV: 'RESERVATION_HOLD_DAYS, DB_HOST', RESERVATION_HOLD_DAYS: '14', DB_HOST: 'db' });
  assert.equal(c.holdDays, 14);
});

test('un entier hors bornes est refusé', () => {
  assert.throws(() => loadConfig({ RESERVATION_HOLD_DAYS: '0' }), ConfigError);
  assert.throws(() => loadConfig({ PORT: 'abc' }), ConfigError);
});
