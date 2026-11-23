import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { APP, appDeployment, kubectl } from '../../shared/kubectl.mjs';
import { ROOT } from '../../shared/run.mjs';

const FILE = 'project/monitoring/DIAGNOSTIC.md';
const REF = /ERR-[0-9A-F]{8}/g;
// usine incident erreurs note l'empreinte SHA-256 de la référence cherchée (celle de la requête citée par le ticket).
const INCIDENT = path.join(ROOT, '.usine/incidents/erreurs.env');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
function expectedHash() {
  if (!existsSync(INCIDENT)) return null;
  return /^ERROR_REF_SHA256=([0-9a-f]{64})/m.exec(readFileSync(INCIDENT, 'utf8'))?.[1] ?? null;
}

export const title = 'Trouver la cause dans les logs';
export const explain = 'Pourquoi la référence de l’erreur n’est-elle pas dans la réponse HTTP, seulement dans les logs ?';
export const instructions = `L'alerte dit qu'il y a des erreurs ; elle ne dit pas lesquelles. Le ticket du support, affiché par usine incident
erreurs, cite l'identifiant d'une requête en échec (support-XXXXXXXX). Chaque erreur injectée a écrit dans les logs
une ligne JSON avec son identifiant de requête (request_id) et une référence unique (error_ref, de la forme
ERR-1A2B3C4D), absente de la réponse HTTP. Retrouve la référence de la requête du ticket dans Grafana, Explore,
source Loki :
  {app="reservations"} | json | event="fault_error"
Écris project/monitoring/DIAGNOSTIC.md : la référence trouvée, l'heure, le pod, la route touchée, et la requête
LogQL qui l'a trouvée. Commite.

À expliquer (npx lab submit monitoring diagnostic) : pourquoi la référence de l'erreur n'est-elle pas dans la réponse HTTP, seulement dans les logs ?`;

export const checks = [
  {
    id: 'reference-trouvee',
    label: `${FILE} cite la référence de l'erreur de la requête du ticket, telle qu'écrite dans les logs`,
    run: async () => {
      const file = path.join(ROOT, FILE);
      assert(existsSync(file), `Attendu : ${FILE}. Constaté : absent.`);
      const cited = new Set(readFileSync(file, 'utf8').match(REF) ?? []);
      assert(cited.size > 0, `Attendu : au moins une référence ERR-XXXXXXXX dans ${FILE}. Constaté : aucune.`);
      const hash = expectedHash();
      if (hash) {
        assert([...cited].some((r) => sha256(r) === hash), `Attendu : la référence de la requête citée par le ticket (support-…). Constaté : ${[...cited].slice(0, 3).join(', ')}, qui n'est pas la bonne. Filtre les logs sur son request_id.`);
        return;
      }
      const ns = (await appDeployment()).metadata.namespace;
      const logs = await kubectl(['logs', '-n', ns, '-l', `app.kubernetes.io/name=${APP}`, '--tail=-1', '--since=6h', '--max-log-requests=10'], { timeout: 20000 });
      const seen = new Set(logs.stdout.match(REF) ?? []);
      assert(seen.size > 0, 'Attendu : des erreurs injectées dans les logs des pods. Constaté : aucune (pods redémarrés ?). Relance usine incident erreurs, puis cherche de nouveau.');
      assert([...cited].some((r) => seen.has(r)), `Attendu : une référence présente dans les logs. Constaté : ${[...cited].slice(0, 3).join(', ')} introuvable(s) dans les logs actuels des pods.`);
    }
  }
];

export const hints = [
  'Dans Grafana, Explore, source Loki : quels labels permettent de choisir les logs de l’application ?',
  'Les logs sont en JSON : | json les découpe en champs ; on filtre sur request_id (celui du ticket), et le champ error_ref porte la référence.',
  '{app="reservations"} | json | request_id="support-…" | line_format "{{.error_ref}} {{.path}}" ; recopie la référence dans DIAGNOSTIC.md.'
];

export const points = 100;
