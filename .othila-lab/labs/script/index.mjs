export const title = 'Script de déploiement';
export const steps = ['livrer', 'rejouer', 'refuser', 'bonus-shellcheck'];
export const duration = '1 h';
export const summary = `Mardi 9 h : le service se déploie à la main, en SSH. Vous allez écrire ce que vous faites à la main dans un script,
project/deploy/deploy.sh, qui déploie une référence Git sur srv-test et vérifie chaque étape.

Pourquoi un script : une procédure écrite se rejoue à l'identique, se relit, se corrige. Un script de déploiement
sérieux s'arrête à la première erreur (set -euo pipefail), ne touche au serveur qu'une fois le code vérifié, et
termine par un contrôle (le service répond-il ?). Il doit être rejouable : le lancer deux fois de suite ne casse rien.

Ce qu'il ne sait pas faire, et que les labs suivants vont régler : il se lance à la main, depuis un seul poste
(pipeline-ci), il ne garde aucune trace de ce qui a été livré (livraison), il suppose un serveur déjà là, créé par
quelqu'un d'autre (terraform), et il ne sait parler qu'à un serveur à la fois (ansible).

Exigence de l'exercice 1 : chaque commande du script est commentée. Le formateur le lit à la correction.
Pas de base de données dans ce lab : /health est vert, /ready reste rouge, c'est normal.
Étapes 1 à 3 : le socle. Étape bonus-shellcheck : facultative.
Après npx lab catchup script : usine rebuild.`;
export const objectives = [
  'traduire une procédure manuelle en script Bash qui s’arrête à la première erreur',
  'livrer une référence Git précise et le prouver par /version',
  'rendre un déploiement rejouable, et sûr quand il échoue',
  'nommer les limites d’un déploiement par script'
];
