import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { assert } from '@othila-academy/lab';
import { ROOT } from '../../shared/run.mjs';

const FILE = 'project/runbooks/CI.md';
export const SECTIONS = ['Ce que vérifie le pipeline', "Bénéfices pour l'équipe", 'Bénéfices pour les parties prenantes', 'Limites'];
const norm = (s) => s.normalize('NFC').replace(/[’]/g, "'").trim().toLowerCase();

export const title = 'Expliquer le pipeline';
export const explain = 'Quel bénéfice de l’intégration continue un responsable non technique comprend-il le mieux ?';
export const instructions = `Exercice 2 du référentiel, question rédigée. Écris ${FILE}, une page, avec exactement ces titres de niveau 2 :
  ## Ce que vérifie le pipeline
  ## Bénéfices pour l'équipe
  ## Bénéfices pour les parties prenantes
  ## Limites
Quelques lignes par section, avec vos mots : que vérifie votre pipeline, ce qu'il change pour l'équipe (retour rapide,
confiance pour fusionner…), pour les parties prenantes (délais, qualité, traçabilité), et ce qu'il ne fait pas encore.
Le check ne vérifie que les titres ; le fond est évalué par le formateur. Commite et pousse.

À expliquer (npx lab submit pipeline-ci rapport) : quel bénéfice de l'intégration continue un responsable non technique comprend-il le mieux ?`;

export const checks = [
  {
    id: 'ci-md-sections',
    label: `${FILE} contient les quatre sections demandées`,
    run: async () => {
      const file = path.join(ROOT, FILE);
      assert(existsSync(file), `Attendu : ${FILE}. Constaté : absent.`);
      const titles = readFileSync(file, 'utf8').split('\n').filter((l) => /^##\s/.test(l)).map((l) => norm(l.replace(/^##\s+/, '')));
      const missing = SECTIONS.filter((s) => !titles.includes(norm(s)));
      assert(missing.length === 0, `Attendu : les sections ${SECTIONS.map((s) => `« ${s} »`).join(', ')}. Constaté : il manque ${missing.map((s) => `« ${s} »`).join(', ')}. Titres de niveau 2 : une ligne qui commence par « ## ».`);
    }
  }
];

export const hints = [
  'Quels titres le check attend-il ? Ils sont dans la consigne, à recopier tels quels.',
  'Un fichier Markdown : chaque section commence par une ligne « ## Titre », suivie de quelques lignes de texte.',
  `mkdir -p project/runbooks, puis ${FILE} avec les quatre lignes ## de la consigne, chacune suivie de trois ou quatre phrases.`
];

export const points = 75;
