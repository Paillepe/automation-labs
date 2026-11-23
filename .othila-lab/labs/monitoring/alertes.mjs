import { assert } from '@othila-academy/lab';
import { attendre } from '../../shared/attendre.mjs';
import { ALERTS, RECEIVER_WEBHOOK, notifications, prom } from '../../shared/supervision.mjs';

const firing = async () => (await prom('/api/v1/alerts')).alerts.filter((a) => a.labels.alertname === ALERTS.errors && a.state === 'firing');

export const title = 'Être prévenu';
export const explain = 'Entre la panne et la notification, combien de temps s’est écoulé, et d’où vient chaque morceau de ce délai ?';
export const instructions = `Écris project/monitoring/alertmanager.yml : une route par défaut vers un récepteur (receivers), qui envoie
par webhook à ${RECEIVER_WEBHOOK} (le récepteur de notifications local, fourni). Puis :
  usine up monitoring
  usine incident erreurs        une panne passagère : une part des requêtes répond 500
Regarde l'alerte passer de inactive à pending puis firing (Prometheus, Alerts), puis arriver dans Alertmanager
(http://127.0.0.1:18093) et au récepteur (http://127.0.0.1:18099). Le check attend jusqu'à 3 minutes.

À expliquer (npx lab submit monitoring alertes) : entre la panne et la notification, combien de temps s'est écoulé, et d'où vient chaque morceau de ce délai ?`;

export const checks = [
  {
    id: 'alerte-firing',
    label: `après usine incident erreurs, l'alerte ${ALERTS.errors} passe à firing (jusqu'à 180 s)`,
    run: async () => {
      await attendre(async () => (await firing()).length > 0, {
        delai: 180,
        attendu: `${ALERTS.errors} à l'état firing`,
        constat: async () => {
          const a = (await prom('/api/v1/alerts')).alerts.find((x) => x.labels.alertname === ALERTS.errors);
          return a ? `état ${a.state}` : 'alerte inactive : as-tu lancé usine incident erreurs ? Ton expression dépasse-t-elle le seuil ?';
        }
      });
    }
  },
  {
    id: 'notification-recue',
    label: `le récepteur local a reçu la notification de ${ALERTS.errors} (jusqu'à 120 s)`,
    run: async () => {
      await attendre(async () => (await notifications()).some((n) => (n.alerts ?? []).some((a) => a.labels?.alertname === ALERTS.errors)), {
        delai: 120,
        attendu: `une notification de ${ALERTS.errors} reçue`,
        constat: async () => `${(await notifications()).length} notification(s), aucune pour ${ALERTS.errors}. La route d'alertmanager.yml mène-t-elle à ${RECEIVER_WEBHOOK} ?`
      });
    }
  }
];

export const hints = [
  'L’alerte est-elle firing dans Prometheus ? Si oui, le problème est entre Alertmanager et le récepteur : que montre Status dans Alertmanager ?',
  'alertmanager.yml : route.receiver nomme un récepteur, déclaré dans receivers avec webhook_configs ; group_wait court pour le lab.',
  `route: { receiver: equipe, group_wait: 10s, group_interval: 30s } ; receivers: [{ name: equipe, webhook_configs: [{ url: ${RECEIVER_WEBHOOK}, send_resolved: true }] }].`
];

export const points = 125;
