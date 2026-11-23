import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { APP, appDeployment, kubectl } from '../../shared/kubectl.mjs';
import { ROOT } from '../../shared/run.mjs';

const FILE = 'project/monitoring/DIAGNOSTIC.md';
const REF = /ERR-[0-9A-F]{8}/g;

export const title = 'Trouver la cause dans les logs';
export const explain = 'Pourquoi la référence de l’erreur n’est-elle pas dans la réponse HTTP, seulement dans les logs ?';
export const instructions = `L'alerte dit qu'il y a des erreurs ; elle ne dit pas lesquelles. Chaque erreur injectée par usine incident erreurs
a écrit dans les logs une ligne JSON avec une référence unique (error_ref, de la forme ERR-1A2B3C4D), absente de la
réponse HTTP. Retrouve-la dans Grafana, Explore, source Loki :
  {app="reservations"} | json | event="fault_error"
Écris project/monitoring/DIAGNOSTIC.md : la ou les références trouvées, l'heure, le pod, la route touchée, et la
requête LogQL qui les a trouvées. Commite.

À expliquer (npx lab submit monitoring diagnostic) : pourquoi la référence de l'erreur n'est-elle pas dans la réponse HTTP, seulement dans les logs ?`;

export const checks = [
  {
    id: 'reference-trouvee',
    label: `${FILE} cite une référence d'erreur injectée, telle qu'écrite dans les logs`,
    run: async () => {
      const file = path.join(ROOT, FILE);
      assert(existsSync(file), `Attendu : ${FILE}. Constaté : absent.`);
      const cited = new Set(readFileSync(file, 'utf8').match(REF) ?? []);
      assert(cited.size > 0, `Attendu : au moins une référence ERR-XXXXXXXX dans ${FILE}. Constaté : aucune.`);
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
  'Les logs sont en JSON : | json les découpe en champs, puis on filtre sur event="fault_error" ; le champ error_ref porte la référence.',
  '{app="reservations"} | json | event="fault_error" | line_format "{{.error_ref}} {{.path}}" ; recopie une référence dans DIAGNOSTIC.md.'
];

export const points = 100;
