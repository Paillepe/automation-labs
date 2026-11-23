import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFaults } from '../src/faults.js';

test('sans panne, aucune erreur', () => {
  const f = createFaults({ random: () => 0 });
  assert.equal(f.pickError(), null);
});

test('taux d\'erreur : chaque erreur reçoit une référence unique', () => {
  const f = createFaults({ random: () => 0 });
  f.set({ errorRate: 1 });
  const a = f.pickError();
  const b = f.pickError();
  assert.match(a, /^ERR-[0-9A-F]{8}$/);
  assert.notEqual(a, b);
});

test('valeurs invalides refusées, clear remet à zéro', () => {
  const f = createFaults();
  assert.throws(() => f.set({ errorRate: 2 }), RangeError);
  assert.throws(() => f.set({ latencyMs: -1 }), RangeError);
  f.set({ errorRate: 0.5, latencyMs: 100 });
  assert.deepEqual(f.clear(), { errorRate: 0, latencyMs: 0 });
});
