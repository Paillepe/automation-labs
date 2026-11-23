import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { ROOT } from '../../shared/run.mjs';

const FILE = 'project/runbooks/MISE-A-JOUR.md';
const SECTIONS = ['Avant', 'Mise à jour', 'Vérification', 'Retour arrière'];
const norm = (s) => s.normalize('NFC').trim().toLowerCase();

export const title = 'Écrire la procédure de mise à jour';
export const explain = 'Quelle commande de ta procédure ramène la version précédente, et que faut-il faire ensuite dans Git ?';
export const instructions = `Exercice 4 du référentiel : la procédure de mise à jour sans interruption. Écris ${FILE} avec ces titres de
niveau 2, dans cet ordre :
  ## Avant            ce qui doit être vrai avant de commencer (pipeline vert, tag, image publiée)
  ## Mise à jour      les commandes, dans l'ordre, et ce que fait le cluster pendant ce temps
  ## Vérification     comment on sait que c'est fini et que tout va bien
  ## Retour arrière   comment revenir à la version précédente, sans coupure non plus
Le check ne vérifie que les titres ; le fond est évalué par le formateur. Commite et pousse.

À expliquer (npx lab submit resilience procedure) : quelle commande de ta procédure ramène la version précédente, et que faut-il faire ensuite dans Git ?`;

export const checks = [
  {
    id: 'mise-a-jour-md',
    label: `${FILE} contient les sections Avant, Mise à jour, Vérification, Retour arrière`,
    run: async () => {
      const file = path.join(ROOT, FILE);
      assert(existsSync(file), `Attendu : ${FILE}. Constaté : absent.`);
      const titles = readFileSync(file, 'utf8').split('\n').filter((l) => /^##\s/.test(l)).map((l) => norm(l.replace(/^##\s+/, '')));
      const missing = SECTIONS.filter((s) => !titles.includes(norm(s)));
      assert(missing.length === 0, `Attendu : les sections ${SECTIONS.join(', ')}. Constaté : il manque ${missing.join(', ')}.`);
    }
  }
];

export const hints = [
  'Quels titres le check attend-il ? Ils sont dans la consigne.',
  'Chaque section est une ligne « ## Titre », suivie des commandes et de ce qu’elles font.',
  `${FILE} : ## Avant, ## Mise à jour, ## Vérification, ## Retour arrière ; reprends tes commandes de l'étape mise-a-jour, et kubectl rollout undo pour le retour.`
];

export const points = 50;
