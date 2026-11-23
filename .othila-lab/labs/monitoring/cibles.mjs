import { assert } from '@othila-academy/lab';
import { ALERTS, prom } from '../../shared/supervision.mjs';

const loadedRules = async () => (await prom('/api/v1/rules')).groups.flatMap((g) => g.rules.map((r) => r.name));

export const title = 'Collecter et charger les règles';
export const explain = 'Ton alerte d’erreurs se déclenche-t-elle sur une cause ou sur un symptôme ? Pourquoi est-ce important ?';
export const instructions = `Démarre la supervision et regarde ce qu'elle voit déjà :
  usine up monitoring
  Prometheus (navigateur : http://127.0.0.1:18090), Status > Targets : les pods de l'application sont-ils up ?
  Essaie : sum by (status) (rate(http_requests_total[5m]))
Écris project/monitoring/rules/alertes.yml : un groupe de règles Prometheus avec trois alertes, nommées exactement
${ALERTS.errors} (part des réponses 5xx au-dessus d'un seuil, par exemple 5 % sur 1 minute), ${ALERTS.cpu}
(CPU des conteneurs de l'application proche de leur limite) et ${ALERTS.memory} (mémoire proche de la limite).
Les expressions sont libres. Mets un for: court (30 s) à ${ALERTS.errors} : l'étape suivante l'attend.
  usine up monitoring          recharge tes fichiers
  Prometheus, Status > Rules : tes trois règles, sans erreur.

À expliquer (npx lab submit monitoring cibles) : ton alerte d'erreurs se déclenche-t-elle sur une cause ou sur un symptôme ? Pourquoi est-ce important ?`;

export const prediction = {
  promptId: 'monitoring-erreurs-nuit',
  question: 'À 3 h du matin, un pod renvoie 30 % d’erreurs 500, sans redémarrer. Qui est prévenu aujourd’hui ?',
  choices: ['personne', 'Kubernetes', 'l’équipe d’astreinte'],
  expected: 'personne'
};

export const checks = [
  {
    id: 'cibles-up',
    label: "les cibles de l'application sont up dans Prometheus",
    run: async () => {
      const { activeTargets } = await prom('/api/v1/targets?state=active');
      const app = activeTargets.filter((t) => Object.values({ ...t.labels, ...t.discoveredLabels }).some((v) => /reservations/.test(String(v))));
      assert(app.length > 0, "Attendu : des cibles de l'application dans Prometheus. Constaté : aucune. Prometheus collecte les pods dont l'image est reservations:<version>, port 8080 : tes pods tournent-ils ?");
      const down = app.filter((t) => t.health !== 'up');
      assert(down.length === 0, `Attendu : toutes up. Constaté : ${down.length} sur ${app.length} en échec (${down[0]?.lastError ?? '?'}).`);
    }
  },
  {
    id: 'trois-regles',
    label: `les règles ${ALERTS.errors}, ${ALERTS.cpu} et ${ALERTS.memory} sont chargées par Prometheus`,
    run: async () => {
      const names = await loadedRules();
      const missing = Object.values(ALERTS).filter((n) => !names.includes(n));
      assert(missing.length === 0, `Attendu : ${Object.values(ALERTS).join(', ')}. Constaté : il manque ${missing.join(', ')} (chargées : ${names.join(', ') || 'aucune'}). usine up monitoring recharge project/monitoring/rules/.`);
    }
  }
];

export const hints = [
  'Que montrent Status > Targets et Status > Rules dans Prometheus ? Une règle absente n’a pas été chargée, ou son fichier ne se lit pas.',
  'Le fichier suit le format des règles Prometheus : groups, puis rules, chacune avec alert, expr, for, labels, annotations.',
  `groups: [{ name: reservations, rules: [{ alert: ${ALERTS.errors}, expr: 'sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) > 0.05', for: 30s }, …] } ; promtool n’est pas requis : usine up monitoring dit si le fichier est refusé.`
];

export const points = 75;
