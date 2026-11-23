import { assert } from '@othila-academy/lab';
import { grafana, query } from '../../shared/supervision.mjs';

// Les tableaux de bord du projet : ceux que Grafana a chargés depuis project/monitoring/dashboards/, dossier « Valmorin ».
async function dashboards() {
  const list = await grafana('/api/search?type=dash-db');
  return (list ?? []).filter((d) => d.folderTitle === 'Valmorin');
}

export const title = 'Un tableau de bord qui répond';
export const explain = 'Si tu ne gardais qu’un panneau pour l’astreinte, lequel, et pourquoi ?';
export const instructions = `Construis un tableau de bord dans Grafana (http://127.0.0.1:18300) : au moins le débit de
requêtes par statut, la part d'erreurs, et un quantile de durée (http_request_duration_seconds_bucket). Puis exporte-le
(Share > Export > JSON) dans project/monitoring/dashboards/reservations.json et relance usine up monitoring : ce qui n'est pas
dans project/ disparaît au prochain usine rebuild.
Le check interroge Grafana sur les tableaux chargés, puis Prometheus sur chaque requête de chaque panneau.

À expliquer (npx lab submit monitoring tableau) : si tu ne gardais qu'un panneau pour l'astreinte, lequel, et pourquoi ?`;

export const checks = [
  {
    id: 'tableau-charge',
    label: 'Grafana a chargé ton tableau de bord depuis project/monitoring/',
    run: async (ctx) => {
      const list = await dashboards();
      assert(list.length > 0, 'Attendu : un tableau de bord chargé depuis project/monitoring/. Constaté : aucun. Exporte-le en JSON dans project/monitoring/dashboards/, puis usine up monitoring.');
      ctx.state.uid = list[0].uid;
    }
  },
  {
    id: 'panneaux-repondent',
    label: 'chaque panneau du tableau de bord renvoie des données',
    run: async (ctx) => {
      const uid = ctx.state.uid ?? (await dashboards())[0]?.uid;
      assert(uid, 'Attendu : un tableau de bord. Constaté : aucun.');
      const { dashboard } = await grafana(`/api/dashboards/uid/${uid}`);
      const panels = (dashboard.panels ?? []).flatMap((p) => (p.type === 'row' ? p.panels ?? [] : [p])).filter((p) => p.targets?.length);
      assert(panels.length > 0, `Attendu : des panneaux avec une requête. Constaté : aucun dans « ${dashboard.title} ».`);
      const empty = [];
      for (const panel of panels) {
        for (const target of panel.targets) {
          if (!target.expr) continue;
          const expr = target.expr.replaceAll('$__rate_interval', '5m').replaceAll('$__interval', '1m').replaceAll('$__range', '1h');
          const data = await query(expr).catch(() => ({ result: [] }));
          if (!data.result?.length) empty.push(`« ${panel.title} »`);
        }
      }
      assert(empty.length === 0, `Attendu : des données pour chaque panneau. Constaté : vide pour ${[...new Set(empty)].join(', ')}. Essaie la requête dans Prometheus, Graph.`);
    }
  }
];

export const hints = [
  'Chaque panneau a une requête PromQL : la même, collée dans Prometheus (Graph), renvoie-t-elle quelque chose ?',
  'Un panneau vide vient souvent d’un nom de métrique ou de label faux : http_requests_total a les labels status, method, route ; la durée est un histogramme.',
  'sum by (status) (rate(http_requests_total[5m])) ; sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) ; histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))).'
];

export const points = 100;
