// La stack de supervision fournie (usine up monitoring), vue d'un check. CONTRAT avec le flux Fournitures (F1) :
// toutes les adresses et tous les noms imposés sont ici, et seulement ici. Chacun se règle par une variable.
import { assert } from '@othila-academy/lab';
import { get, seen } from './http.mjs';

const NODE = process.env.USINE_CLUSTER_NODE ?? `k3d-${process.env.USINE_CLUSTER ?? 'usine'}-server-0`;
export const PROMETHEUS = process.env.USINE_PROMETHEUS_URL ?? `http://${NODE}:30090`;
export const ALERTMANAGER = process.env.USINE_ALERTMANAGER_URL ?? `http://${NODE}:30093`;
export const GRAFANA = process.env.USINE_GRAFANA_URL ?? `http://${NODE}:30300`;
export const RECEIVER = process.env.USINE_RECEIVER_URL ?? `http://${NODE}:30099`;
// Ce que voit Alertmanager, dans le cluster : l'adresse du récepteur de notifications, à citer dans alertmanager.yml.
export const RECEIVER_WEBHOOK = process.env.USINE_RECEIVER_WEBHOOK ?? 'http://receiver.monitoring.svc:8080/alertmanager';
// Les noms des règles d'alerte, imposés par la fiche (les expressions sont libres).
export const ALERTS = { errors: 'HighErrorRate', cpu: 'HighCpuUsage', memory: 'HighMemoryUsage' };
export const DOWN = 'la supervision ne répond pas : lance usine up monitoring (ou usine rebuild), puis relance le check.';

export async function prom(pathname) {
  const r = await get(`${PROMETHEUS}${pathname}`, { timeout: 5000 });
  assert(r.status, `Prometheus ${DOWN}`);
  assert(r.ok && r.json?.status === 'success', `Attendu : une réponse de Prometheus. Constaté : ${seen(r)} ${r.json?.error ?? ''}`);
  return r.json.data;
}

export const query = (expr) => prom(`/api/v1/query?query=${encodeURIComponent(expr)}`);

export async function grafana(pathname) {
  const r = await get(`${GRAFANA}${pathname}`, { timeout: 5000, });
  assert(r.status, `Grafana : ${DOWN}`);
  assert(r.ok, `Attendu : une réponse de Grafana. Constaté : ${seen(r)}.`);
  return r.json;
}

// Les notifications enregistrées par le récepteur local : [{ receivedAt, path, body }], body au format webhook d'Alertmanager.
export async function notifications() {
  const r = await get(`${RECEIVER}/notifications`, { timeout: 5000 });
  assert(r.status, `Le récepteur de notifications : ${DOWN}`);
  assert(r.ok && Array.isArray(r.json), `Attendu : la liste des notifications reçues. Constaté : ${seen(r)}.`);
  return r.json;
}
