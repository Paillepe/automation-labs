export const title = 'Livraison continue';
export const steps = ['image-locale', 'publier', 'deployer', 'version', 'bonus-non-root'];
export const duration = '2 h';
export const summary = `Votre pipeline vérifie chaque commit, mais il ne livre rien : le code vérifié reste sur GitHub, et la mise en
service passe encore par deploy.sh. La livraison continue ajoute au pipeline la fabrication d'un livrable unique,
une image de conteneur, publiée dans un registre (GitHub Container Registry, ghcr.io) et étiquetée du SHA du commit.
Cette image, et elle seule, part ensuite dans chaque environnement : test, puis production. On sait toujours quel
commit tourne, parce que l'étiquette et /version le disent.

Livraison continue : chaque commit vérifié produit un livrable prêt à partir ; la mise en production reste une décision
humaine. Déploiement continu : elle part sans intervention. Stratégies de déploiement, de la plus simple à la plus
prudente : remplacement progressif (rolling update, lab resilience), bleu/vert (deux environnements, on bascule le
trafic), canari (une petite part du trafic d'abord).

Secrets en pipeline : le jeton du workflow (secrets.GITHUB_TOKEN) suffit pour publier sur ghcr.io, à condition de
déclarer permissions: packages: write. Aucun mot de passe en clair dans le dépôt : ce qui est commité est public,
et le reste dans l'historique.

L'environnement de test est fourni : usine deploy test tire de votre registre l'image du commit courant et la lance
dans app-test, à côté d'une base de test db-test. Le lab se termine par une version : le tag Git v1.0.0, que votre
pipeline publie aussi sous l'étiquette 1.0.0. Elle servira au lab cluster.
Étapes image-locale à version : le socle. Étape bonus-non-root : facultative. Démonstration du formateur, sans check :
le déploiement continu, par un runner auto-hébergé et un environnement soumis à approbation.
Après npx lab catchup livraison : usine rebuild, puis git push -u origin HEAD.`;
export const objectives = [
  'construire une image qui porte sa version et son commit',
  'la publier sur ghcr.io depuis le pipeline, sans aucun secret en clair',
  'déployer en test exactement l’image publiée, et le prouver par son condensat',
  'distinguer livraison continue et déploiement continu'
];
