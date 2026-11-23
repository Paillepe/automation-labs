export const title = 'Intégration continue';
export const steps = ['workflow', 'vert', 'rouge', 'rapport', 'bonus-protection'];
export const duration = '2 h';
export const summary = `Votre deploy.sh lance les tests, mais seulement quand quelqu'un le lance, depuis son poste. L'intégration continue
retourne la question : à chaque push, sur chaque branche, et à chaque pull request, une machine neutre récupère le code,
l'installe, l'analyse, le construit et le teste. Un commit qui casse un test se voit dans la minute, avant d'atteindre
la branche principale.

Vocabulaire de GitHub Actions : un workflow (.github/workflows/ci.yml) réagit à des évènements (on: push,
pull_request) ; il contient des jobs, qui tournent chacun sur un runner (runs-on) ; un job enchaîne des steps, soit
une commande (run:), soit une action réutilisable (uses: actions/checkout@v7). Un artefact est un fichier gardé après
l'exécution : ici, le rapport de tests JUnit, téléchargeable depuis l'onglet Actions.
Épinglez ce que vous utilisez : Node.js 24 (le même que le devcontainer et les serveurs), les actions par version
majeure (actions/checkout@v7, actions/setup-node@v7, actions/upload-artifact@v6). Un pipeline qui dépend de
« latest » ne se rejoue pas à l'identique.

Ce qui doit casser le build : une erreur de lint, un test en échec, une image qui ne se construit pas. Ce qui ne doit
pas le casser : la météo du réseau. Pour aller plus loin, Jenkins, GitLab CI et CircleCI suivent les mêmes notions
sous d'autres noms (pipeline, stage, job, agent ou runner).

Étapes workflow à rapport : le socle. Étape bonus-protection : facultative.
Après npx lab catchup pipeline-ci : usine rebuild, puis git push -u origin HEAD.`;
export const objectives = [
  'écrire un workflow GitHub Actions déclenché à chaque push et à chaque pull request',
  'enchaîner lint, construction et tests, et publier le rapport de tests',
  'prouver que le pipeline teste vraiment, en le faisant échouer',
  'formuler les bénéfices de l’intégration continue pour l’équipe et les parties prenantes'
];
