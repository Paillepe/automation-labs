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
- toute montée de fichiers passe par `LOCAL_WORKSPACE_FOLDER` (le démon Docker est celui de l'hôte, ADR-0001) ;
- rien n'est publié sur `0.0.0.0` : les ports vers l'hôte sont liés à `127.0.0.1` et configurables par variable.

`_lib.sh` fournit : `title`, `info`, `ok`, `warn`, `fail`, `hint`, `die`, `require_docker`, `list_images`,
`image_present`, `ensure_network` (crée le réseau et y rattache le devcontainer).
