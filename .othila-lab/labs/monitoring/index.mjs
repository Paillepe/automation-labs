import { ALERTS, RECEIVER_WEBHOOK } from '../../shared/supervision.mjs';

export const title = 'Supervision et logs';
export const steps = ['cibles', 'alertes', 'tableau', 'diagnostic', 'bonus-latence'];
export const duration = '1 h 15';
export const summary = `Ça tient, mais on ne voit rien : si les erreurs montent à 3 h du matin, personne ne le sait. Superviser, c'est
mesurer en continu (métriques), garder la trace de ce qui s'est passé (logs), et être prévenu quand un symptôme
dépasse un seuil (alertes). Les traces distribuées complètent le trio, sans lab ici.

La stack est fournie et déjà branchée sur l'application : usine up monitoring. Prometheus découvre les pods et collecte
leurs métriques (/metrics) en les tirant (modèle pull) ; Alertmanager reçoit les alertes de Prometheus, les regroupe et
les route vers des destinataires (ici, un récepteur de notifications local qui enregistre tout ce qu'il reçoit) ;
Loki garde les logs, collectés par Grafana Alloy (Promtail est en fin de vie depuis mars 2026) ; Grafana affiche
tableaux de bord et logs. Vos fichiers vivent dans project/monitoring/, et usine up monitoring les charge :
  rules/*.yml           règles d'alerte Prometheus (noms imposés : ${ALERTS.errors}, ${ALERTS.cpu}, ${ALERTS.memory})
  alertmanager.yml      routage d'Alertmanager, vers le récepteur ${RECEIVER_WEBHOOK}
  dashboards/*.json     tableaux de bord Grafana (dossier « Valmorin » dans Grafana)
  DIAGNOSTIC.md         ce que les logs vous ont appris
usine up monitoring valide vos fichiers avant de les charger : un fichier refusé est nommé, la stack garde sa
configuration précédente. Après chaque modification : usine up monitoring.
PromQL en trois idées : rate(compteur[5m]) donne un débit par seconde ; sum by (label) agrège ; un quantile se tire
d'un histogramme par histogram_quantile(0.95, sum by (le) (rate(…_bucket[5m]))). Cardinalité : chaque combinaison
de labels est une série ; jamais d'identifiant de requête en label. Alerter sur les symptômes (des erreurs vues par
les utilisateurs), pas sur les causes supposées ; un SLO fixe l'objectif (99 % de requêtes sans erreur).
Les alertes CPU et mémoire se rapportent aux requests et aux limits posées au lab resilience.

Grafana dans le navigateur du poste : http://127.0.0.1:18300 (accès sans mot de passe : c'est un poste de lab).
Étapes cibles à diagnostic : le socle. Étape bonus-latence : facultative. Notification réelle (Slack, courriel) et
règle d'inhibition : pistes sans check.
Après npx lab catchup monitoring : usine rebuild.`;
export const objectives = [
  'vérifier que Prometheus collecte bien l’application',
  'écrire des règles d’alerte sur des symptômes et les router vers un destinataire',
  'construire un tableau de bord dont chaque panneau répond',
  'retrouver dans les logs la cause précise d’un incident'
];
