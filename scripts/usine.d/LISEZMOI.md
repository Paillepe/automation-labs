# Commandes de `usine`

`scripts/usine` est un répartiteur : `usine <commande> [arguments]` exécute `scripts/usine.d/<commande>.sh`.
Ajouter une commande, c'est ajouter un fichier. Personne n'édite le fichier d'un autre flux.

Contrat d'une commande :

- nom de fichier en minuscules, chiffres et tirets (`deploy.sh`, `incident.sh`) ; un fichier qui commence par `_`
  est une bibliothèque, pas une commande ;
- en tête : `#!/usr/bin/env bash`, une ligne `# usine: <description en français>` (reprise par `usine help`),
  puis `set -euo pipefail` et `source "$USINE_D/_lib.sh"` ;
- variables fournies : `USINE_ROOT` (racine du dépôt), `USINE_D` (ce dossier), `USINE_NETWORK` (réseau Docker commun) ;
- les arguments de la ligne de commande arrivent tels quels dans `"$@"` ;
- **idempotente**, messages en français, code de sortie non nul en cas d'échec ;
- **aucune montée de fichiers** : le démon Docker est celui de l'hôte, il ne voit ni les worktrees du rejeu ni les
  chemins Windows. Les fichiers passent par `docker cp`, le contexte de `docker build`, `kubectl apply` ou SSH ;
- rien n'est publié sur `0.0.0.0` : les ports vers l'hôte sont liés à `127.0.0.1` et configurables par variable.

`_lib.sh` fournit : `title`, `info`, `ok`, `warn`, `fail`, `hint`, `die`, `require_docker`, `list_images`,
`image_present`, `ensure_network` (crée le réseau et y rattache le devcontainer).

## Cibles de `usine up`, `usine down`, `usine status`

`up.sh`, `down.sh` et `status.sh` (flux Chaîne) ne connaissent aucune cible : chacune vit dans son propre fichier,
`scripts/usine.d/_target-<nom>.sh`, qui définit trois fonctions :

```bash
target_up()     { …; }   # démarre la cible et attend qu'elle soit saine ; idempotent
target_down()   { …; }   # arrête et supprime la cible, volumes compris ; sans erreur si elle est déjà arrêtée
target_status() { …; }   # une ou deux lignes « info » : ce qui tourne
```

Le fichier est sourcé dans un sous-shell, après `_lib.sh` : toutes ses fonctions sont disponibles.
`usine down` sans argument arrête toutes les cibles, dans l'ordre de `USINE_TARGET_ORDER` (`_lib.sh`) :
`monitoring cluster test infra servers`, puis les autres.

| Cible | Fichier | Flux |
|---|---|---|
| `servers` | `_target-servers.sh` (srv-test, `infra/compose.servers.yaml`) | Chaîne |
| `test` | `_target-test.sh` (arrêt seulement ; le démarrage est `usine deploy test`) | Chaîne |
| `infra` | `_target-infra.sh` (le Terraform de `project/infra/`) | Chaîne |
| `cluster` | `_target-cluster.sh` | Fournitures (F1) |
| `monitoring` | `_target-monitoring.sh` | Fournitures (F1) |

## `usine rebuild` (flux Chaîne)

Supprime tout (`usine down`), puis reconstruit depuis `project/`, chaque étape seulement si ses fichiers existent :
srv-test (tant que `project/infra/` ne décrit aucun conteneur), `terraform apply`, `ansible-playbook site.yml`,
cluster (`usine up cluster`, `usine release <v>` pour chaque `image: …reservations:<v>` des manifests,
`kubectl apply -f project/k8s/`), supervision (`usine up monitoring`). Enfin, si `.usine/incident` existe et que
`incident.sh` est fourni : `usine incident resume`, qui doit réinjecter l'incident en cours (SPEC §6.4).
