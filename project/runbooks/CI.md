# Intégration continue (CI)

## Ce que vérifie le pipeline

Le pipeline GitHub Actions se déclenche automatiquement à chaque push sur une n'importe quelle branche et à chaque pull request. Il récupère le code, installe Node.js 24 et les dépendances du projet, puis exécute les contrôles avec ESLint et les tests automatisés. Il construit également l'image Docker de l'application. Enfin, il publie le rapport de tests au format JUnit, même si une étape précédente échoue.

## Bénéfices pour l'équipe

L'intégration continue permet de détecter rapidement les erreurs, dès qu'un développeur pousse son code. Toute l'équipe dispose ainsi d'un retour objectif sur la qualité des modifications. Cela facilite la recherche des problèmes, évite de découvrir tardivement des régressions et donne davantage de confiance avant de fusionner une branche dans la branche principale.

## Bénéfices pour les parties prenantes

Les parties prenantes bénéficient d'un meilleur suivi de la qualité du projet. La détection précoce des erreurs limite les retards et réduit le risque de livrer une version défectueuse, avec des bugs intriqués difficiles à corriger. Les rapports de tests conservés dans GitHub apportent également une traçabilité des vérifications effectuées sur chaque commit.

## Limites

Un pipeline vert ne garantit pas que l'application fonctionne parfaitement dans toutes les situations. Il vérifie uniquement les contrôles et les tests qui ont été définis. Notre pipeline ne réalise pas encore de tests de performance, de sécurité approfondis, comme par exemple gitleaks, ni de validation complète dans un environnement de production. Il ne remplace donc pas les tests complémentaires et la supervision après déploiement.