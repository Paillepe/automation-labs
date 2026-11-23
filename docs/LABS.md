# Les labs du cours

Quatre jours, dix labs, un seul fil rouge : le service de réservation des médiathèques de Valmorin. Chaque lab part
de ce que le précédent a laissé. Tout se passe dans le terminal du devcontainer.

**La règle de la semaine : si ce n'est pas dans `project/`, ça n'existe pas.** Conteneurs, serveurs, cluster et
volumes sont jetables ; `usine rebuild` reconstruit tout depuis tes fichiers.

## Le parcours

| Séance | Lab | Ce que tu produis | Dans `project/` |
|---|---|---|---|
| J1 matin | `demarrage` | Ton poste vérifié, ton fork du cours | — |
| J1 matin | `script` | Un script qui déploie une référence Git sur `srv-test` | `deploy/deploy.sh` |
| J1 après-midi | `pipeline-ci` | Un pipeline GitHub Actions : lint, construction, tests, rapport | `.github/workflows/ci.yml`, `runbooks/CI.md` |
| J2 matin | `livraison` | L'image publiée sur ghcr.io, déployée en test, la version `v1.0.0` | `ci.yml` |
| J2 après-midi | `terraform` | Deux réseaux, deux serveurs web, une base isolée, une dérive corrigée | `infra/*.tf` |
| J3 matin | `ansible` | Le déploiement sur les deux serveurs, idempotent, secret chiffré | `ansible/` |
| J3 après-midi | `cluster` | L'application sur Kubernetes : Deployment, Service, Ingress | `k8s/` |
| J4 matin | `resilience` | Trois réplicas, sondes, mise à jour `v1.1.0` sans coupure, Secret | `k8s/`, `runbooks/MISE-A-JOUR.md` |
| J4 après-midi | `monitoring` | Alertes, routage, tableau de bord, diagnostic par les logs | `monitoring/` |
| J4 après-midi | `incident` | L'épreuve, en binôme : livrée le vendredi | `runbooks/POSTMORTEM.md` |

Chaque lab a des étapes obligatoires (le socle) et, à la fin, des étapes `bonus-…` facultatives.

## Les commandes `lab`

```bash
npx lab start <lab>            # la fiche : le contexte, puis chaque étape et ce que vérifient ses checks
npx lab check <lab> [étape]    # lance les checks ; la première étape te demande d'abord une prédiction
npx lab hint <lab> <étape>     # l'indice suivant (trois par étape : piste, méthode, quasi-solution)
npx lab submit <lab> <étape>   # au vert : ton explication, et les points de l'étape
npx lab progress               # où tu en es
npx lab catchup <lab>          # repartir du début d'un lab, depuis la solution du précédent
npx lab update                 # les fiches et checks corrigés par le formateur (chaque matin)
```

Les points d'une étape sont acquis au premier `submit` fait au vert. Un indice coûte : 10 %, 25 % puis 50 % de
l'étape, selon le plus haut révélé. Un check qui échoue dit ce qu'il attendait et ce qu'il a constaté.

## Les commandes `usine`

```bash
usine doctor              # le poste est-il prêt ?
usine rebuild             # reconstruit tout depuis project/ : après lab init et après chaque lab catchup
usine status              # ce qui tourne, la version servie, la mémoire
usine up <cible>          # servers (srv-test), infra (ton Terraform), cluster, monitoring
usine down [cible]        # arrête et supprime ; sans argument, tout
usine deploy test         # lab livraison : l'image de ton commit, depuis ton registre, dans app-test
usine release <version>   # labs cluster et resilience : l'image de cette version, chargée dans le cluster
usine incident <nom>      # les pannes des labs terraform et monitoring, puis l'épreuve
```

## Rattraper un lab

À la fin de chaque créneau, après la correction, ceux qui ne sont pas au vert repartent du début du lab suivant :

```bash
git add -A && git commit -m "Mon travail sur <lab>"   # lab catchup exige un arbre propre
npx lab catchup <lab suivant>
usine rebuild
git push -u origin HEAD                                 # pour les labs qui passent par GitHub
```

Ton travail reste sur ta branche ; tu continues sur la nouvelle (`catchup-<lab>`).

## Si l'outil ne répond pas

Chaque fiche se suffit : `npx lab start <lab>` l'affiche, et la solution d'un lab se lit dans Git :
`git diff solution/<lab précédent> solution/<lab>`.
