// Métriques au format texte de Prometheus, sans bibliothèque : un compteur de requêtes par statut et un
// histogramme de durée, plus quelques métriques du processus.

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function labels(obj) {
  const parts = Object.entries(obj).map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

export function createMetrics({ version, commit }) {
  const requests = new Map(); // clé : method|route|status
  const durations = new Map(); // clé : method|route
  const startedAt = Date.now() / 1000;

  function observe({ method, route, status, seconds }) {
    const rkey = `${method}|${route}|${status}`;
    requests.set(rkey, (requests.get(rkey) ?? 0) + 1);

    const dkey = `${method}|${route}`;
    let h = durations.get(dkey);
    if (!h) {
      h = { counts: BUCKETS.map(() => 0), sum: 0, count: 0 };
      durations.set(dkey, h);
    }
    BUCKETS.forEach((le, i) => {
      if (seconds <= le) h.counts[i] += 1;
    });
    h.sum += seconds;
    h.count += 1;
  }

  function render() {
    const out = [];
    out.push('# HELP app_info Version et commit de l\'application en cours d\'exécution.');
    out.push('# TYPE app_info gauge');
    out.push(`app_info${labels({ version, commit })} 1`);

    out.push('# HELP http_requests_total Requêtes HTTP traitées, par méthode, route et statut.');
    out.push('# TYPE http_requests_total counter');
    for (const [key, value] of requests) {
      const [method, route, status] = key.split('|');
      out.push(`http_requests_total${labels({ method, route, status })} ${value}`);
    }

    out.push('# HELP http_request_duration_seconds Durée de traitement des requêtes HTTP.');
    out.push('# TYPE http_request_duration_seconds histogram');
    for (const [key, h] of durations) {
      const [method, route] = key.split('|');
      BUCKETS.forEach((le, i) => {
        out.push(`http_request_duration_seconds_bucket${labels({ method, route, le })} ${h.counts[i]}`);
      });
      out.push(`http_request_duration_seconds_bucket${labels({ method, route, le: '+Inf' })} ${h.count}`);
      out.push(`http_request_duration_seconds_sum${labels({ method, route })} ${h.sum}`);
      out.push(`http_request_duration_seconds_count${labels({ method, route })} ${h.count}`);
    }

    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    out.push('# HELP process_resident_memory_bytes Mémoire résidente du processus.');
    out.push('# TYPE process_resident_memory_bytes gauge');
    out.push(`process_resident_memory_bytes ${mem.rss}`);
    out.push('# HELP process_cpu_seconds_total Temps CPU consommé par le processus.');
    out.push('# TYPE process_cpu_seconds_total counter');
    out.push(`process_cpu_seconds_total ${(cpu.user + cpu.system) / 1e6}`);
    out.push('# HELP process_start_time_seconds Heure de démarrage du processus (epoch).');
    out.push('# TYPE process_start_time_seconds gauge');
    out.push(`process_start_time_seconds ${startedAt}`);
    return `${out.join('\n')}\n`;
  }

  return { observe, render };
}
