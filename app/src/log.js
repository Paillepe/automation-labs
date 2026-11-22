// Journal JSON structuré : une ligne par évènement sur la sortie standard, lisible par Loki, jq ou kubectl logs.

const ORDER = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

export function createLogger({ level = 'info', service = 'reservations', write = (line) => process.stdout.write(line) } = {}) {
  const threshold = ORDER[level] ?? ORDER.info;

  function emit(lvl, msg, fields = {}) {
    if (ORDER[lvl] < threshold) return;
    const entry = { time: new Date().toISOString(), level: lvl, service, msg, ...fields };
    write(`${JSON.stringify(entry)}\n`);
  }

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    fatal: (msg, fields) => emit('fatal', msg, fields),
  };
}
