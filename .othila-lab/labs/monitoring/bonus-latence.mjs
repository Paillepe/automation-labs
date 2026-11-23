import { assert } from '@othila-academy/lab';
import { prom } from '../../shared/supervision.mjs';

export const title = 'Bonus — alerter sur la latence';
export const explain = 'Pourquoi un quantile plutôt qu’une moyenne pour alerter sur la latence ?';
export const instructions = `Facultatif. Ajoute à project/monitoring/rules/ une règle HighLatency sur le 95e centile de la durée des requêtes
(histogram_quantile sur http_request_duration_seconds_bucket), par exemple au-dessus de 500 ms pendant 1 minute.
Essaie-la avec une latence injectée (en-tête X-Fault-Token: lab-fault-token, POST /fault {"latencyMs":800} sur un pod),
puis retire la panne (DELETE /fault). Autres pistes, sans check : une règle d'inhibition dans Alertmanager, une vraie
notification (Slack, courriel).

À expliquer (npx lab submit monitoring bonus-latence) : pourquoi un quantile plutôt qu'une moyenne pour alerter sur la latence ?`;

export const checks = [
  {
    id: 'regle-latence',
    label: 'une règle HighLatency, fondée sur un quantile, est chargée par Prometheus',
    run: async () => {
      const rules = (await prom('/api/v1/rules')).groups.flatMap((g) => g.rules);
      const rule = rules.find((r) => r.name === 'HighLatency');
      assert(rule, 'Attendu : une règle HighLatency. Constaté : absente.');
      assert(/histogram_quantile/.test(rule.query), 'Attendu : une expression fondée sur histogram_quantile. Constaté : autre chose.');
    }
  }
];

export const hints = [
  'Quelle fonction PromQL tire un quantile d’un histogramme ?',
  'histogram_quantile(0.95, …) prend la somme par le des débits des buckets.',
  'expr: histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m]))) > 0.5, for: 1m.'
];

export const points = 50;
