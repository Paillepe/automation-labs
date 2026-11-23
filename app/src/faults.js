// Injection de pannes, pour les labs resilience et monitoring. Désactivée tant que FAULT_TOKEN n'est pas défini.
//   errorRate : part des requêtes métier qui répondent 500 (0 à 1)
//   latencyMs : délai ajouté à chaque requête métier
//   freeze    : bloque le processus (plus aucune réponse, /health compris)

import { randomBytes } from 'node:crypto';

export function createFaults({ random = Math.random } = {}) {
  const state = { errorRate: 0, latencyMs: 0 };

  return {
    state: () => ({ ...state }),
    set({ errorRate, latencyMs } = {}) {
      if (errorRate !== undefined) {
        const v = Number(errorRate);
        if (!(v >= 0 && v <= 1)) throw new RangeError('errorRate doit être compris entre 0 et 1');
        state.errorRate = v;
      }
      if (latencyMs !== undefined) {
        const v = Number(latencyMs);
        if (!(Number.isInteger(v) && v >= 0 && v <= 60000)) throw new RangeError('latencyMs doit être un entier entre 0 et 60000');
        state.latencyMs = v;
      }
      return { ...state };
    },
    clear() {
      state.errorRate = 0;
      state.latencyMs = 0;
      return { ...state };
    },
    // Cette requête doit-elle échouer ? Rend une référence unique, à écrire dans les logs, ou null.
    pickError() {
      if (state.errorRate > 0 && random() < state.errorRate) {
        return `ERR-${randomBytes(4).toString('hex').toUpperCase()}`;
      }
      return null;
    },
  };
}

// Bloque le fil d'exécution pendant ms millisecondes (Infinity : pour toujours), sans consommer de CPU.
export function freezeProcess(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
