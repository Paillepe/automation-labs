export const title = 'Démarrage';
export const steps = ['poste', 'fork', 'serveur', 'tests'];
export const duration = '30 min';
export const summary = `Vous êtes l'équipe d'exploitation de l'agglomération de Valmorin. L'équipe de développement vous remet le
service de réservation des médiathèques (dossier app/) : une API Node.js 24 et sa base PostgreSQL. Vous ne la
développez pas : pendant quatre jours, vous construisez l'usine qui l'amène en production et l'y maintient.
Mardi 9 h, elle se déploie à la main, en SSH. Vendredi 16 h, un commit part en production sans intervention, on sait
quel commit tourne, on est prévenu quand ça casse et on sait réparer. La preuve, la même pendant quatre jours :
/version renvoie la version et le SHA du commit qui tourne.

Ce premier lab ne rapporte presque rien : il vérifie votre poste et crée votre dépôt. Tout tourne dans le
devcontainer ; les « serveurs » sont des conteneurs, jetables. Une seule règle pour la semaine :
si ce n'est pas dans project/, ça n'existe pas. usine rebuild reconstruit tout depuis vos fichiers.

Ordre des gestes, important : le fork vient avant toute commande lab (lab update lit le dépôt du cours, upstream).`;
export const objectives = [
  'vérifier son poste avec usine doctor et le réparer si besoin',
  'forker le dépôt du cours : le cours devient upstream, votre dépôt origin',
  'se connecter en SSH à un serveur du cours avec la clé de lab',
  'lancer les tests de l’application en local'
];
