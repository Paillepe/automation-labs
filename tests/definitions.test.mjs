// Les règles d'écriture des labs, au-delà de ce que lab-cli vérifie (reprises de dba-labs) :
// trois indices et des points explicites par étape, libellés de 200 caractères au plus (borne du contrat othila-lab),
// identifiants uniques, la question de soumission dans la consigne, une prédiction en première étape (SPEC §6.2),
// les étapes bonus en fin de lab. Lancement : node --test tests/
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const root = new URL('../.othila-lab/', import.meta.url);
const formation = JSON.parse(readFileSync(new URL('formation.json', root), 'utf8'));
const labs = formation.seances.flatMap((s) => s.labs);
const prompts = new Set();

for (const lab of labs) {
  test(`définition du lab ${lab}`, async () => {
    const dir = new URL(`labs/${lab}/`, root);
    const index = await import(new URL('index.mjs', dir).href);
    for (const key of ['title', 'duration', 'summary']) assert.ok(index[key], `${lab} : ${key} manquant`);
    assert.ok(index.objectives?.length, `${lab} : objectives manquant`);
    const ids = new Set();
    let bonusSeen = false;
    for (const [i, stepId] of index.steps.entries()) {
      const where = `${lab}/${stepId}`;
      assert.match(stepId, SLUG, `${where} : identifiant d'étape invalide`);
      const step = await import(new URL(`${stepId}.mjs`, dir).href);
      const bonus = stepId.startsWith('bonus-');
      if (bonusSeen) assert.ok(bonus, `${where} : une étape du socle après une étape bonus`);
      bonusSeen ||= bonus;
      if (bonus) assert.match(step.instructions, /^Facultatif\./, `${where} : une étape bonus s'annonce « Facultatif. »`);
      assert.ok(step.title, `${where} : title manquant`);
      assert.ok(step.explain, `${where} : explain manquant`);
      assert.ok(step.instructions.includes(`npx lab submit ${lab} ${stepId}`), `${where} : la consigne doit poser la question de soumission`);
      assert.equal(step.hints?.length, 3, `${where} : 3 indices attendus`);
      assert.ok(Number.isInteger(step.points), `${where} : points manquant`);
      for (const check of step.checks) {
        assert.match(check.id, SLUG, `${where} : identifiant de check invalide (${check.id})`);
        assert.ok(!ids.has(check.id), `${where} : check ${check.id} en double`);
        ids.add(check.id);
        assert.ok(check.label.length <= 200, `${where}/${check.id} : libellé de ${check.label.length} caractères`);
      }
      if (i === 0 && lab !== 'demarrage') assert.ok(step.prediction, `${where} : la première étape fait prédire (SPEC §6.2)`);
      if (step.prediction) {
        const { promptId, choices, expected } = step.prediction;
        assert.ok(!prompts.has(promptId), `${where} : promptId ${promptId} déjà utilisé`);
        prompts.add(promptId);
        assert.ok(choices.includes(expected), `${where} : expected absent des choix`);
      }
    }
  });
}
